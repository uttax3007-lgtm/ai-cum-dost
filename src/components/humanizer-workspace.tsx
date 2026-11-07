"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp, Check, ChevronDown, Clipboard, Copy, FileText, Mail,
  MessageSquareText, RotateCcw, Sparkles, WandSparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";

type Mode = "text" | "email" | "generic";
type Intensity = "minimal" | "medium" | "heavy";

const modes: { id: Mode; label: string; description: string; icon: typeof FileText; placeholder: string; inputLabel: string; outputLabel: string }[] = [
  {
    id: "text", label: "Text Humanizer", description: "Articles, assignments and blogs", icon: FileText,
    placeholder: "Paste your paragraph, article, assignment or blog draft here…",
    inputLabel: "Original text", outputLabel: "Humanized text",
  },
  {
    id: "email", label: "Email Humanizer", description: "Professional and personal emails", icon: Mail,
    placeholder: "Paste your email draft here. Include the subject or greeting if you have one…",
    inputLabel: "Original email", outputLabel: "Humanized email",
  },
  {
    id: "generic", label: "Generic Humanizer", description: "Messages, reports and descriptions", icon: MessageSquareText,
    placeholder: "Paste a message, report, description or any other writing…",
    inputLabel: "Original content", outputLabel: "Humanized content",
  },
];

const intensityOptions: { id: Intensity; label: string; detail: string }[] = [
  { id: "minimal", label: "Minimal", detail: "Light edits, original structure" },
  { id: "medium", label: "Medium", detail: "Balanced, natural rewriting" },
  { id: "heavy", label: "Heavy", detail: "More substantial rewriting" },
];

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function EditorStats({ value }: { value: string }) {
  return (
    <div className="editor-stats">
      <span>{countWords(value).toLocaleString()} words</span>
      <span>{value.length.toLocaleString()} characters</span>
    </div>
  );
}

export function HumanizerWorkspace() {
  const [mode, setMode] = useState<Mode>("text");
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const activeMode = useMemo(() => modes.find((item) => item.id === mode)!, [mode]);

  async function copyText(value: string, label: string) {
    if (!value) {
      toast.error(`There is no ${label.toLowerCase()} to copy.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard.`);
    } catch {
      toast.error("Clipboard access was blocked by your browser.");
    }
  }

  async function humanize() {
    if (!input.trim()) {
      toast.error("Add some text before you humanize it.");
      return;
    }
    if (countWords(input) > 2000) {
      toast.error("The synchronous API supports up to 2,000 words per request.");
      return;
    }

    setLoading(true);
    setElapsed(null);
    const started = performance.now();
    try {
      const response = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input, intensity, mode }),
      });
      const data = await response.json() as { success?: boolean; output?: string; processingTime?: number; error?: string };
      if (!response.ok || !data.success || typeof data.output !== "string") {
        throw new Error(data.error || "Humanization failed. Please try again.");
      }
      setOutput(data.output);
      setElapsed(typeof data.processingTime === "number" ? data.processingTime : (performance.now() - started) / 1000);
      toast.success("Your text is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setOutput("");
    setElapsed(null);
  }

  function swapText() {
    if (!output) {
      toast.error("Humanize some text before swapping.");
      return;
    }
    setInput(output);
    setOutput("");
    setElapsed(null);
    toast.success("Output moved into the original editor.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="#" className="brand" aria-label="AI Cum Dost home">
          <span className="brand-mark"><WandSparkles size={19} strokeWidth={2.2} /></span>
          <span>AI Cum Dost</span>
        </a>
        <nav className="desktop-nav" aria-label="Humanizer modes">
          <button className="nav-home active" onClick={() => switchMode("text")}>Home</button>
          {modes.map((item) => (
            <button key={item.id} className={mode === item.id ? "nav-link selected" : "nav-link"} onClick={() => switchMode(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <ThemeToggle />
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="status-dot" /> YOUR WRITING WORKSPACE</div>
        <h1>Your words. Your voice.<br /><span>More human.</span></h1>
        <p>Make your writing feel natural and clear. Keep the meaning, find the right tone, and make every word sound like you.</p>
      </section>

      <section className="workspace-wrap">
        <div className="mode-switcher" role="tablist" aria-label="Choose a humanization mode">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} role="tab" aria-selected={mode === item.id} className={`mode-tab ${mode === item.id ? "is-active" : ""}`} onClick={() => switchMode(item.id)}>
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={mode} className="mode-caption" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
            <span>{activeMode.description}</span>
            <span className="mode-tag">TOHUMAN POWERED</span>
          </motion.div>
        </AnimatePresence>

        <div className="editor-grid">
          <section className="editor-panel">
            <div className="panel-heading">
              <div><span className="panel-index">01</span><h2>{activeMode.inputLabel}</h2></div>
              <button className="icon-action" onClick={() => setInput("")} disabled={!input || loading} aria-label="Clear input" title="Clear input"><X size={16} /></button>
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={activeMode.placeholder}
              maxLength={12000}
              spellCheck
              aria-label={activeMode.inputLabel}
            />
            <div className="panel-bottom">
              <EditorStats value={input} />
              <button className="text-action" onClick={() => copyText(input, "Original text")} disabled={!input}><Copy size={14} /> Copy</button>
            </div>
          </section>

          <div className="swap-control">
            <button onClick={swapText} disabled={!output || loading} aria-label="Move output to original editor" title="Move output to original editor"><ArrowDownUp size={17} /></button>
          </div>

          <section className="editor-panel output-panel">
            <div className="panel-heading">
              <div><span className="panel-index">02</span><h2>{activeMode.outputLabel}</h2></div>
              {output && <span className="ready-badge"><Check size={12} /> Ready</span>}
            </div>
            <div className={`output-content ${!output ? "is-empty" : ""}`} aria-live="polite">
              {loading ? (
                <div className="loading-state">
                  <span className="loader" />
                  <strong>Working on your words…</strong>
                  <span>Connecting securely to ToHuman</span>
                </div>
              ) : output ? (
                <p>{output}</p>
              ) : (
                <div className="empty-state">
                  <span className="empty-icon"><Sparkles size={20} /></span>
                  <strong>Your humanized text will appear here</strong>
                  <span>Your result will keep the meaning of your original writing.</span>
                </div>
              )}
            </div>
            <div className="panel-bottom">
              <EditorStats value={output} />
              <button className="text-action" onClick={() => copyText(output, "Humanized text")} disabled={!output}><Clipboard size={14} /> Copy</button>
            </div>
          </section>
        </div>

        <div className="controls-row">
          <div className="intensity-control">
            <span className="control-label">REWRITING INTENSITY</span>
            <div className="intensity-options">
              {intensityOptions.map((option) => (
                <button key={option.id} className={intensity === option.id ? "intensity-option chosen" : "intensity-option"} onClick={() => setIntensity(option.id)} title={option.detail} disabled={loading}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="run-actions">
            {elapsed !== null && <span className="time-label">{elapsed.toFixed(2)}s</span>}
            <button className="reset-button" onClick={() => { setInput(""); setOutput(""); setElapsed(null); }} disabled={loading || (!input && !output)}><RotateCcw size={15} /> Reset</button>
            <button className="humanize-button" onClick={humanize} disabled={loading || !input.trim()}>
              {loading ? <><span className="button-spinner" /> Humanizing</> : <><Sparkles size={16} /> Humanize text</>}
            </button>
          </div>
        </div>
        <div className="privacy-note"><span className="lock-dot" /> Your text is sent securely to ToHuman for processing. Your API key stays on the server.</div>
      </section>

      <footer className="footer">
        <div><a href="#" className="footer-brand">AI Cum Dost</a><span> · Your words. Your voice. More human.</span></div>
        <div className="footer-credit">Created by <strong>Utkarsh J.</strong><span className="footer-divider">|</span> Copyright © 2026 AI Cum Dost. All rights reserved.</div>
      </footer>
    </main>
  );
}
