import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const TOHUMAN_API_URL = "https://tohuman.io/api/v1/humanizations";

const requestSchema = z.object({
  content: z
    .string()
    .trim()
    .min(10, "Please enter at least 10 characters.")
    .max(500000, "Your text is too long."),

  intensity: z.enum(["minimal", "medium", "heavy"]).default("medium"),

  mode: z.enum(["text", "email", "generic"]).default("generic"),
});

type ToHumanResponse = {
  id?: string | number;
  status?: string;
  output_content?: string | null;
  processing_time?: number | null;
  estimated_seconds?: number;
  error_message?: string | null;
  error?: string;
  message?: string;
};

function errorResponse(
  message: string,
  status: number = 500
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status }
  );
}

async function parseResponse(
  response: Response
): Promise<ToHumanResponse> {
  const text = await response.text();

  try {
    return JSON.parse(text) as ToHumanResponse;
  } catch {
    throw new Error(
      `ToHuman returned an invalid response (HTTP ${response.status}).`
    );
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Debug: confirms whether the API key is available.
  // Never log the actual API key.
  const apiKey = process.env.TOHUMAN_API_KEY?.trim();

  console.log(
    "ToHuman API configured:",
    Boolean(apiKey)
  );

  if (!apiKey) {
    return errorResponse(
      "ToHuman API key is not configured. Add TOHUMAN_API_KEY to your .env.local file and restart the server.",
      500
    );
  }

  try {
    // 1. Validate incoming request
    const body = await request.json();

    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            validation.error.issues[0]?.message ??
            "Invalid request.",
        },
        { status: 400 }
      );
    }

    const { content, intensity, mode } = validation.data;

    // Mode is used by the frontend to organize the writing workflow.
    // ToHuman currently receives content and intensity.
    void mode;

    // 2. Read timeout configuration
    const configuredTimeout = Number(
      process.env.TOHUMAN_TIMEOUT_MS ?? 240000
    );

    const totalTimeout = Number.isFinite(configuredTimeout)
      ? Math.min(Math.max(configuredTimeout, 30000), 270000)
      : 240000;

    const deadline = Date.now() + totalTimeout;

    // 3. Submit humanization job
    const createResponse = await fetchWithTimeout(
      TOHUMAN_API_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          content,
          intensity,
        }),
      },
      Math.min(30000, totalTimeout)
    );

    const createData = await parseResponse(createResponse);

    if (!createResponse.ok) {
      console.error(
        "ToHuman job creation failed:",
        createResponse.status,
        createData.message ?? createData.error
      );

      if (createResponse.status === 401) {
        return errorResponse(
          "Your ToHuman API key is invalid or expired.",
          401
        );
      }

      if (createResponse.status === 429) {
        return errorResponse(
          "ToHuman rate limit reached. Please wait and try again.",
          429
        );
      }

      return errorResponse(
        createData.message ??
          createData.error ??
          `ToHuman request failed (${createResponse.status}).`,
        createResponse.status >= 400 &&
          createResponse.status < 500
          ? createResponse.status
          : 502
      );
    }

    // 4. Get job ID
    if (createData.id === undefined || createData.id === null) {
      console.error("ToHuman did not return a job ID.");

      return errorResponse(
        "ToHuman accepted the request but did not return a job ID.",
        502
      );
    }

    const jobId = String(createData.id);

    console.log("ToHuman job created:", jobId);

    // 5. Handle an immediately completed response, if provided
    if (createData.status === "completed") {
      if (!createData.output_content) {
        return errorResponse(
          "Humanization completed, but no output text was returned.",
          502
        );
      }

      return NextResponse.json({
        success: true,
        jobId,
        status: "completed",
        output: createData.output_content,
        processingTime:
          createData.processing_time ??
          (Date.now() - startTime) / 1000,
      });
    }

    if (createData.status === "failed") {
      return errorResponse(
        createData.error_message ??
          "ToHuman could not process your text.",
        502
      );
    }

    // 6. Poll the job until completed or failed
    let pollInterval = Math.min(
      Math.max(
        ((createData.estimated_seconds ?? 5) * 1000) / 4,
        1500
      ),
      5000
    );

    while (Date.now() < deadline) {
      const remainingTime = deadline - Date.now();

      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(pollInterval, remainingTime)
        )
      );

      if (Date.now() >= deadline) {
        break;
      }

      const pollResponse = await fetchWithTimeout(
        `${TOHUMAN_API_URL}/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        },
        Math.min(15000, deadline - Date.now())
      );

      const pollData = await parseResponse(pollResponse);

      if (!pollResponse.ok) {
        console.error(
          "ToHuman polling failed:",
          pollResponse.status
        );

        if (pollResponse.status === 429) {
          pollInterval = Math.min(
            pollInterval * 2,
            10000
          );
          continue;
        }

        return errorResponse(
          pollData.message ??
            pollData.error ??
            `Unable to retrieve job status (${pollResponse.status}).`,
          502
        );
      }

      // 7. Check job status
      if (pollData.status === "completed") {
        if (!pollData.output_content) {
          return errorResponse(
            "Humanization completed, but the output was empty.",
            502
          );
        }

        console.log(
          "ToHuman job completed:",
          jobId
        );

        return NextResponse.json({
          success: true,
          jobId,
          status: "completed",
          output: pollData.output_content,
          processingTime:
            pollData.processing_time ??
            (Date.now() - startTime) / 1000,
        });
      }

      if (pollData.status === "failed") {
        console.error(
          "ToHuman job failed:",
          pollData.error_message
        );

        return errorResponse(
          pollData.error_message ??
            "ToHuman failed to humanize your text. Please try again.",
          502
        );
      }

      if (
        pollData.status !== "pending" &&
        pollData.status !== "processing"
      ) {
        console.error(
          "Unexpected ToHuman status:",
          pollData.status
        );

        return errorResponse(
          "ToHuman returned an unexpected job status.",
          502
        );
      }

      // Gradually increase polling interval.
      pollInterval = Math.min(
        pollInterval * 1.25,
        5000
      );
    }

    // 8. Timeout handling
    return errorResponse(
      "Humanization is taking longer than expected. Please try again.",
      504
    );
  } catch (error) {
    console.error(
      "Humanization API error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      return errorResponse(
        "The ToHuman API request timed out. Please try again.",
        504
      );
    }

    if (error instanceof SyntaxError) {
      return errorResponse(
        "Invalid JSON request received.",
        400
      );
    }

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Something went wrong while humanizing your text.",
      500
    );
  }
}