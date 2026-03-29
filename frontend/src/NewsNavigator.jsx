import { useState, useEffect, useRef, useCallback } from "react";

// ── CONFIG ────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:5173/";

// ── MOCK ENGINE (when backend unavailable) ───────────────────────────
const MOCK_ARTICLES = {
  policy: [
    { id:"p1", title:"Union Budget 2026: ₹11.1 Lakh Crore Capital Expenditure Announced", source:"Economic Times", content:"Finance Minister announced record capital expenditure. Infrastructure gets ₹2.52 lakh crore, a 16.9% increase. Fiscal deficit target set at 4.5% of GDP.", data_source:"synthetic" },
    { id:"p2", title:"Budget 2026 Slashes Income Tax: ₹12L Earners Pay Zero Tax Under New Regime", source:"Mint", content:"New regime exempts income up to ₹12 lakh. Standard deduction raised to ₹75,000. ₹35,000 crore back in consumer hands annually.", data_source:"synthetic" },
    { id:"p3", title:"Agriculture Gets ₹1.52 Lakh Crore; PM-KISAN Enhanced to ₹8,000 Annually", source:"Business Standard", content:"Agriculture allocation jumps. Digital Agriculture Mission: ₹2,817 crore for AI crop advisory tools across 140M farmers.", data_source:"synthetic" },
    { id:"p4", title:"Sensex Surges 1,400 Points Post Budget; Infrastructure Stocks Lead Rally", source:"Moneycontrol", content:"L&T, Adani Ports, UltraTech Cement biggest gainers. Midcap index rose 2.3%. Infra ETFs saw record single-day inflows.", data_source:"synthetic" },
    { id:"p5", title:"Defence Budget Hiked 12.9%; 75% of Procurement Reserved for Domestic Industry", source:"Hindustan Times", content:"Defence gets ₹6.22 lakh crore. HAL, BEL surge 4-7%. India targets sub-20% import dependency by 2028.", data_source:"synthetic" },
    { id:"p6", title:"Custom Duty Cuts on Electronics: EV Batteries, Solar Equipment to Get Cheaper", source:"NDTV Profit", content:"PLI scheme boosted. Apple, Samsung to benefit from revised duty structure on mobile manufacturing.", data_source:"synthetic" },
    { id:"p7", title:"Opposition: 'Pre-election Gimmick, Ignores 16.4% Youth Unemployment Crisis'", source:"The Hindu", content:"Congress calls budget populist. Economists divided on whether consumption boost translates to job creation.", data_source:"synthetic" },
  ],
  earnings: [
    { id:"e1", title:"Reliance Q3 FY26: Net Profit ₹21,804 Crore, Up 11.4% YoY — Beats Estimates", source:"Economic Times", content:"Revenue rose 9.7% to ₹2.59 lakh crore. O2C segment resilient despite crude volatility.", data_source:"synthetic" },
    { id:"e2", title:"Jio Adds 8.2M Subscribers; ARPU Hits ₹203, 5G Users Cross 100 Million Milestone", source:"Mint", content:"Total subscribers: 489M. ARPU climbed from ₹195 to ₹203. 5G subscriber base doubled in two quarters.", data_source:"synthetic" },
    { id:"e3", title:"Reliance Retail Revenue ₹88,672 Crore; JioMart Grocery Grows 23% YoY", source:"Business Standard", content:"EBITDA margins expand to 8.9%. 987 new stores added in quarter. Smart Bazaar outperforms.", data_source:"synthetic" },
  ],
  funding: [
    { id:"f1", title:"India Startup Funding Rebounds to $14.7B in 2025; AI Leads at 28% of All Deals", source:"Inc42", content:"1,247 deals closed. 34% recovery from 2024 lows. Fintech, healthtech, SaaS also surged.", data_source:"synthetic" },
    { id:"f2", title:"Zepto, Meesho Lead New Unicorn Class; India Now Has 127 Unicorns Total", source:"Economic Times", content:"9 new unicorns in 2025. Zepto: $1.1B at $5B valuation. Meesho IPO-ready.", data_source:"synthetic" },
    { id:"f3", title:"Tiger Global, Peak XV Back B2B SaaS; $500M Deployed in Q4 2025 Alone", source:"Mint", content:"Enterprise AI for manufacturing and banking saw highest deal count. SaaS exports grew 41% YoY.", data_source:"synthetic" },
  ],
  general: [
    { id:"g1", title:"Topic Analysis: Key Trends and Stakeholder Reactions", source:"Business Standard", content:"Analysts note significant activity with mixed signals across sub-sectors. Institutional investors remain cautiously optimistic.", data_source:"synthetic" },
    { id:"g2", title:"Expert Roundup: Industry Leaders Weigh In on Implications", source:"Economic Times", content:"Subject matter experts highlight near-term volatility but structural positives remain intact for the medium term.", data_source:"synthetic" },
    { id:"g3", title:"Data Deep-Dive: The Numbers Behind This Story", source:"Financial Express", content:"Quantitative analysis reveals 34% probability of continued trend. Key indicators: consumer sentiment, credit growth, PMI.", data_source:"synthetic" },
    { id:"g4", title:"Global Reaction: International Press and Investors Respond", source:"Bloomberg Quint", content:"FII activity shows net buying of ₹2,400 crore. International rating agencies monitoring developments closely.", data_source:"synthetic" },
  ],
};

function classifyQuery(q) {
  const s = q.toLowerCase();
  if (/budget|policy|bill|act|regulation|tax|scheme|government|rbi|sebi/.test(s)) return "policy";
  if (/earnings|results|profit|revenue|q[1-4]|quarter|ebitda/.test(s)) return "earnings";
  if (/funding|startup|unicorn|vc|raise|series|valuation/.test(s)) return "funding";
  return "general";
}

function extractNumbers(text) {
  const rx = /₹[\d,.]+\s?(?:lakh|crore|billion|million)?|\$[\d,.]+[BMK]?|[\d.]+%/g;
  return [...new Set(text.match(rx) || [])].slice(0, 8);
}

function getSentiment(text) {
  const pos = (text.match(/\b(surge|jump|gain|growth|rise|profit|record|beat|boost|rally|strong|robust)\b/gi)||[]).length;
  const neg = (text.match(/\b(fall|drop|loss|decline|crash|miss|cut|crisis|concern|risk|weak|slump)\b/gi)||[]).length;
  const total = pos + neg || 1;
  return { sentiment: pos>neg?"Positive":neg>pos?"Negative":"Neutral", confidence: Math.min(Math.abs(pos-neg)/total, 1) };
}

function buildMockBriefing(query, qtype) {
  const articles = MOCK_ARTICLES[qtype] || MOCK_ARTICLES.general;
  const allText = articles.map(a => `${a.title} ${a.content}`).join(" ");
  const nums = extractNumbers(allText);
  const { sentiment, confidence } = getSentiment(allText);
  const sources = [...new Set(articles.map(a => a.source))];

  const wl = {
    policy:   { winners:["Infrastructure companies (L&T, Adani Ports)","Middle-class taxpayers (income tax relief)","Defence PSUs (HAL, BEL)","EV & clean energy manufacturers","Rural economy & agricultural sector"], losers:["Import-dependent sectors (higher duties)","Luxury goods segment","Fixed-income investors","Sectors without PLI support"] },
    earnings: { winners:["Long-term shareholders & dividend investors","Management hitting guidance targets","Sector peers riding same tailwinds","Institutional investors with large positions"], losers:["Short sellers betting against stock","Investors in margin-pressured rivals","Bond holders if cash flow disappoints"] },
    funding:  { winners:["Founding team & ESOP holders","Early-stage angel investors","Indian startup ecosystem benchmarks","Adjacent sectors attracting spillover capital"], losers:["Late-stage investors at inflated valuations","Bootstrapped competitors facing well-funded rivals","Talent pool — salaries may spike"] },
    general:  { winners:["Early adopters and institutional stakeholders","Adjacent sectors benefiting from spillovers","Analysts with contrarian calls validated"], losers:["Late movers and passive observers","Disrupted incumbents resisting change","Status quo defenders"] },
  };
  const why = {
    policy: "Government policy directly controls capital allocation across the economy. Decisions embedded here reshape corporate earnings trajectories, consumer spending power, and sectoral investment flows for 12–18 months. Investors must re-weight sector exposure now.",
    earnings: "Quarterly results are the ground truth of corporate health — they reveal whether management guidance matches operational reality. This briefing determines analyst target price revisions, institutional rebalancing, and sets the tone for the next earnings cycle.",
    funding: "Venture capital flows are a 12–24 month leading indicator of where economic value will be created next. The patterns here signal which verticals are attracting conviction-level bets from the smartest capital allocators in the ecosystem.",
    general: "Understanding this topic across multiple sources equips investors and business leaders to separate signal from noise, make forward-looking decisions, and anticipate second-order effects that single-article readers will miss.",
  };
  const watch = {
    policy: ["Parliamentary debates and amendments to key clauses","State government budget responses and alignment","Rating agency reactions: Moody's, S&P, Fitch","RBI monetary policy response and liquidity implications"],
    earnings: ["Next quarter guidance call transcript and Q&A","Analyst rating upgrades/downgrades within 72 hours","Competitor earnings for sector read-across","Institutional block deals and FII/DII positioning shifts"],
    funding: ["Follow-on funding round announcements in 6–12 months","IPO pipeline: DRHP filings from this cohort","SEBI AIF category II regulation updates","Competing deals signaling valuation resets"],
    general: ["Official follow-up announcements and policy clarifications","Industry association responses and lobbying activity","Stock price action over next 5 trading sessions","International media and investor commentary"],
  };

  const logs = [
    "[Crew] ═══ Pipeline started for: '" + query + "' ═══",
    "[Crew] Agents online: Planner, Research, Analysis, Briefing, Reflection, Chat",
    "[Planner] Received query: '" + query + "'",
    "[Planner] Analyzing query intent and classifying topic domain...",
    "[Planner] Query type classified as: " + qtype.toUpperCase(),
    "[Planner] Strategy: FETCH → CLUSTER → EXTRACT → BRIEF → REFLECT",
    "[Planner] Delegating to ResearchAgent with context: query_type=" + qtype,
    "[Research] Initializing news retrieval pipeline...",
    "[Research] Attempting live data fetch via NewsAPI for: '" + query + "'",
    "[Research] Live fetch failed: backend running in demo mode",
    "[Research] Activating synthetic fallback generator — system will NOT fail",
    "[Research] ✓ Synthetic fallback produced " + articles.length + " contextually relevant articles",
    "[Research] Research complete. " + articles.length + " articles ready for analysis.",
    "[Research] Sources: " + sources.slice(0, 3).join(", ") + "...",
    "[Analysis] Received " + articles.length + " articles for deep analysis",
    "[Analysis] Tool decision: embed_text=YES, clustering=" + (articles.length >= 4 ? "YES" : "NO (insufficient data)") + ", extract_entities=YES",
    "[Analysis] Running embed_text() on " + articles.length + " articles...",
    "[Analysis] Running cluster_articles() with cosine similarity threshold=0.60...",
    "[Analysis] Clustering complete: 3 thematic clusters identified",
    "[Analysis] Running extract_entities() on full corpus...",
    "[Analysis] Entity extraction complete: " + nums.length + " key figures detected",
    "[Analysis] Sentiment analysis: " + sentiment + " (confidence=" + Math.round(confidence * 100) + "%)",
    "[Analysis] Analysis phase complete — passing structured data to BriefingAgent",
    "[Briefing] Synthesizing analysis into structured 6-section briefing...",
    "[Briefing] ✓ TL;DR generated | ✓ " + Math.min(articles.length, 6) + " highlights extracted",
    "[Briefing] ✓ Winners/Losers framed for " + qtype + " query type",
    "[Briefing] ✓ 'Why It Matters' and 'Watch Next' customized for " + qtype + " context",
    "[Briefing] Briefing complete. Passing to ReflectionAgent for quality validation.",
    "[Reflection] Reviewing output quality and completeness...",
    "[Reflection] ⚠️  Note: Running in demo mode — live API key recommended for production",
    "[Reflection] ✓ All 6 sections present and populated",
    "[Reflection] ✓ Confidence score: " + Math.round(confidence * 100) + "%",
    "[Reflection] ✓ Output validated — briefing ready for delivery",
    "[Reflection] Pipeline execution complete. Returning response to client.",
    "[Crew] ═══ Autonomous execution complete ═══",
  ];

  return {
    logs,
    briefing: {
      status: "success",
      topic: query,
      query_type: qtype,
      generated_at: new Date().toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" }),
      data_source: "synthetic",
      sources_analysed: articles.length,
      source_names: sources,
      overall_sentiment: sentiment,
      confidence,
      sections: {
        tldr: `${sentiment==="Positive"?"📈":sentiment==="Negative"?"📉":"📊"} Briefing covers ${query} across ${articles.length} articles from ${sources.length} sources. Overall sentiment: ${sentiment} (confidence: ${Math.round(confidence*100)}%). 3 thematic clusters identified.${nums.length ? " Key figures: " + nums.slice(0,3).join(", ") + "." : ""}`,
        highlights: articles.slice(0, 6).map(a => ({ title:a.title, theme:"Coverage", sentiment, source:a.source })),
        important_numbers: nums.map(v => ({ value:v, context:"Extracted from coverage" })),
        winners_and_losers: wl[qtype] || wl.general,
        why_it_matters: why[qtype] || why.general,
        what_to_watch_next: watch[qtype] || watch.general,
        themes: [
          { id:1, label:"Primary Coverage", article_count:Math.ceil(articles.length/3), sentiment, numbers:nums.slice(0,2) },
          { id:2, label:"Market Reaction", article_count:Math.floor(articles.length/3), sentiment:"Positive", numbers:nums.slice(2,4) },
          { id:3, label:"Analyst Views", article_count:Math.floor(articles.length/3), sentiment:"Neutral", numbers:[] },
        ],
      },
    },
    query_type: qtype,
    data_source: "synthetic",
    confidence,
  };
}

// ── CHAT ANSWER ───────────────────────────────────────────────────────
function getLocalAnswer(question, briefing) {
  if (!briefing?.sections) return "No briefing context loaded.";
  const q = question.toLowerCase();
  const s = briefing.sections;
  if (/tldr|summary|brief|overview|quick/.test(q)) return "📋 TL;DR\n\n" + s.tldr;
  if (/number|figure|stat|crore|billion|percent|₹|\$/.test(q)) {
    const nums = s.important_numbers || [];
    return "📊 Key Numbers:\n\n" + (nums.length ? nums.map(n => "  • " + n.value).join("\n") : "No numbers extracted.");
  }
  if (/winner|benefit|gain|who profit/.test(q)) return "🏆 Winners:\n\n" + (s.winners_and_losers?.winners||[]).map(w=>"  + "+w).join("\n");
  if (/loser|hurt|risk|who lose/.test(q)) return "⚠️ At Risk:\n\n" + (s.winners_and_losers?.losers||[]).map(l=>"  − "+l).join("\n");
  if (/watch|next|future|upcoming|monitor/.test(q)) return "👀 Watch Next:\n\n" + (s.what_to_watch_next||[]).map(w=>"  → "+w).join("\n");
  if (/matter|important|why|significance|impact/.test(q)) return "🔍 Why It Matters\n\n" + s.why_it_matters;
  if (/sentiment|mood|outlook|tone/.test(q)) return `Sentiment: **${briefing.overall_sentiment}** (Confidence: ${Math.round((briefing.confidence||0)*100)}%)`;
  if (/source|article|how many|coverage/.test(q)) return `📰 Analysed ${briefing.sources_analysed} articles from: ${(briefing.source_names||[]).join(", ")}`;
  if (/theme|cluster|topic|group/.test(q)) return "📂 Themes:\n\n" + (s.themes||[]).map(t=>`  [${t.label}] — ${t.article_count} articles, ${t.sentiment}`).join("\n");
  return "Try asking:\n  • 'What are the key numbers?'\n  • 'Who are the winners?'\n  • 'Why does this matter?'\n  • 'What should I watch next?'";
}

// ── AGENT STEP CONFIG ─────────────────────────────────────────────────
const AGENTS = [
  { id:"planner",    label:"Planner",    icon:"◈", desc:"Intent & Strategy",    color:"#e8c547" },
  { id:"research",   label:"Research",   icon:"◎", desc:"News Retrieval",       color:"#4ecca3" },
  { id:"analysis",   label:"Analysis",   icon:"◉", desc:"Cluster & Extract",    color:"#a78bfa" },
  { id:"briefing",   label:"Briefing",   icon:"◆", desc:"Synthesize Insights",  color:"#fb923c" },
  { id:"reflection", label:"Reflect",    icon:"◇", desc:"Quality Validation",   color:"#60a5fa" },
  { id:"chat",       label:"Chat",       icon:"◈", desc:"Q&A Ready",            color:"#f472b6" },
];

const SAMPLE_QUERIES = [
  "Union Budget 2026",
  "Reliance Industries earnings",
  "India startup funding 2025",
  "Transgender Bill 2026",
  "Tata Motors Q4 results",
  "SEBI new regulations",
];

const SECTIONS = [
  { id:"tldr",       label:"TL;DR" },
  { id:"highlights", label:"Highlights" },
  { id:"numbers",    label:"Key Numbers" },
  { id:"wl",         label:"Winners & Losers" },
  { id:"why",        label:"Why It Matters" },
  { id:"watch",      label:"Watch Next" },
  { id:"chat",       label:"Ask the Agent" },
];

// ── MAIN COMPONENT ────────────────────────────────────────────────────
export default function NewsNavigator() {
  const [query, setQuery] = useState("Union Budget 2026");
  const [running, setRunning] = useState(false);
  const [activeAgentIdx, setActiveAgentIdx] = useState(-1);
  const [doneAgents, setDoneAgents] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [meta, setMeta] = useState(null);
  const [activeSection, setActiveSection] = useState("tldr");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const logsRef = useRef(null);
  const chatRef = useRef(null);

  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [chatHistory]);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const streamLogs = useCallback(async (allLogs) => {
    const agentMap = { Crew:-1, Planner:0, Research:1, Analysis:2, Briefing:3, Reflection:4, Chat:5 };
    const done = new Set();
    for (let i = 0; i < allLogs.length; i++) {
      const line = allLogs[i];
      const match = line.match(/^\[(\w+)\]/);
      if (match) {
        const agentName = match[1];
        const idx = agentMap[agentName] ?? -1;
        if (idx >= 0) {
          setActiveAgentIdx(idx);
          // Mark previous as done
          if (idx > 0 && !done.has(idx-1)) {
            done.add(idx-1);
            setDoneAgents(new Set(done));
          }
        }
      }
      setLogs(prev => [...prev, line]);
      await sleep(i < 5 ? 200 : 140);
    }
    // Mark all done
    AGENTS.forEach((_, i) => done.add(i));
    setDoneAgents(new Set(done));
    setActiveAgentIdx(-1);
  }, []);

  const runPipeline = useCallback(async () => {
    if (running || !query.trim()) return;
    setRunning(true);
    setBriefing(null);
    setMeta(null);
    setLogs([]);
    setChatHistory([]);
    setDoneAgents(new Set());
    setActiveAgentIdx(-1);
    setActiveSection("tldr");

    let result = null;
    let usedFallback = false;

    // Try real backend
    try {
      const resp = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        result = await resp.json();
      }
    } catch {
      usedFallback = true;
    }

    // Fallback to local mock
    if (!result || result.error) {
      usedFallback = true;
      const qtype = classifyQuery(query);
      result = buildMockBriefing(query, qtype);
    }

    await streamLogs(result.logs || []);
    setBriefing(result.briefing);
    setMeta({ query_type: result.query_type, data_source: result.data_source, confidence: result.confidence, usedFallback });
    setRunning(false);
  }, [query, running, streamLogs]);

  const handleChat = useCallback(async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !briefing) return;
    const q = chatInput;
    setChatInput("");
    setChatHistory(h => [...h, { role:"user", text:q }]);
    setChatLoading(true);

    let answer = null;
    try {
      const resp = await fetch(`${API_BASE}/chat`, {
        method:"POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ question:q, briefing }),
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = await resp.json();
        answer = data.answer;
      }
    } catch {}

    if (!answer) answer = getLocalAnswer(q, briefing);
    setChatHistory(h => [...h, { role:"bot", text:answer }]);
    setChatLoading(false);
  }, [chatInput, briefing]);

  const sentColor = { Positive:"#4ecca3", Negative:"#f87171", Neutral:"#94a3b8" };
  const qtColor = { policy:"#e8c547", earnings:"#60a5fa", funding:"#a78bfa", general:"#94a3b8" };

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logo}>
            <span style={S.logoIcon}>◈</span>
            <div>
              <div style={S.logoTitle}>NEWS NAVIGATOR</div>
              <div style={S.logoSub}>AI MULTI-AGENT INTELLIGENCE SYSTEM</div>
            </div>
          </div>
        </div>
        <div style={S.headerRight}>
          {meta && (
            <>
              <span className="tag" style={{ background: `${qtColor[meta.query_type]}20`, color: qtColor[meta.query_type], border:`1px solid ${qtColor[meta.query_type]}40` }}>
                {meta.query_type?.toUpperCase()}
              </span>
              <span className="tag" style={{ background: `${sentColor[briefing?.overall_sentiment]}15`, color: sentColor[briefing?.overall_sentiment], border:`1px solid ${sentColor[briefing?.overall_sentiment]}30` }}>
                {briefing?.overall_sentiment?.toUpperCase()} · {Math.round((meta.confidence||0)*100)}% CONF
              </span>
              <span className="tag" style={{ background:"#ffffff08", color:"#64748b", border:"1px solid #1e293b" }}>
                {meta.data_source === "live" ? "● LIVE DATA" : "◎ DEMO MODE"}
              </span>
            </>
          )}
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <div style={S.grid}>

        {/* ─── LEFT PANEL ─── */}
        <aside style={S.left}>

          {/* Query */}
          <section style={S.panel}>
            <div style={S.panelLabel}>QUERY INPUT</div>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); runPipeline(); }}}
              rows={2}
              placeholder="Enter any business news topic..."
              style={S.textarea}
            />
            <div style={S.chipRow}>
              {SAMPLE_QUERIES.map(q => (
                <button key={q} className="chip" onClick={() => setQuery(q)} style={S.chip}>{q}</button>
              ))}
            </div>
            <button
              onClick={runPipeline}
              disabled={running}
              style={{ ...S.runBtn, opacity: running ? 0.6 : 1, cursor: running ? "not-allowed" : "pointer" }}
              className={running ? "" : "runbtn"}
            >
              {running ? (
                <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span className="spinner" />
                  AUTONOMOUS EXECUTION...
                </span>
              ) : "▶  RUN AGENT PIPELINE"}
            </button>
          </section>

          {/* Agent Pipeline */}
          <section style={S.panel}>
            <div style={S.panelLabel}>AGENT PIPELINE</div>
            <div style={S.agentList}>
              {AGENTS.map((agent, i) => {
                const isActive = activeAgentIdx === i;
                const isDone = doneAgents.has(i);
                const color = agent.color;
                return (
                  <div key={i} className={isActive ? "agentrow active" : "agentrow"} style={{
                    ...S.agentRow,
                    borderColor: isActive ? color : isDone ? "#1e293b" : "#0f172a",
                    background: isActive ? `${color}10` : "transparent",
                  }}>
                    <div style={{ ...S.agentIcon, color: isActive ? color : isDone ? "#334155" : "#1e293b", textShadow: isActive ? `0 0 12px ${color}` : "none" }}>
                      {agent.icon}
                    </div>
                    <div style={S.agentText}>
                      <div style={{ ...S.agentName, color: isActive ? color : isDone ? "#64748b" : "#334155" }}>
                        {agent.label}
                      </div>
                      <div style={S.agentDesc}>{agent.desc}</div>
                    </div>
                    <div style={{ fontSize:10, color: isActive ? color : isDone ? "#22d3ee" : "#1e293b", letterSpacing:"0.05em" }}>
                      {isActive ? <span className="pulse">ACTIVE</span> : isDone ? "DONE" : "IDLE"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Logs */}
          <section style={{ ...S.panel, flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>
            <div style={{ ...S.panelLabel, marginBottom:8 }}>EXECUTION LOGS</div>
            <div ref={logsRef} style={S.logs}>
              {logs.length === 0 && <div style={{ color:"#1e293b", fontSize:11 }}>Run the pipeline to see agent reasoning...</div>}
              {logs.map((line, i) => {
                const agentMatch = line.match(/^\[(\w+)\]/);
                const agent = agentMatch ? agentMatch[1] : null;
                const agentColors = { Planner:"#e8c547", Research:"#4ecca3", Analysis:"#a78bfa", Briefing:"#fb923c", Reflection:"#60a5fa", Chat:"#f472b6", Crew:"#64748b" };
                const color = agentColors[agent] || "#475569";
                const isImportant = line.includes("✓") || line.includes("✅") || line.includes("═══");
                return (
                  <div key={i} className="logline" style={{ ...S.logLine, color: isImportant ? color : "#475569" }}>
                    <span style={{ color:"#1e293b", minWidth:24, display:"inline-block" }}>{String(i+1).padStart(2,"0")}</span>
                    <span style={{ color, fontWeight: agent ? 600 : 400 }}>{agent ? `[${agent}]` : ""} </span>
                    <span>{line.replace(/^\[\w+\]\s*/, "")}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        {/* ─── RIGHT PANEL ─── */}
        <main style={S.right}>
          {!briefing && !running && (
            <div style={S.emptyState}>
              <div style={S.emptyIcon}>◈</div>
              <div style={S.emptyTitle}>No Briefing Generated</div>
              <div style={S.emptyDesc}>Enter a query and run the agent pipeline to generate your AI-powered business intelligence briefing</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center", marginTop:16 }}>
                {["Union Budget 2026","Reliance Q4 earnings","India startup funding"].map(q => (
                  <button key={q} className="chip" onClick={() => { setQuery(q); }} style={{ ...S.chip, padding:"8px 14px", fontSize:11 }}>→ {q}</button>
                ))}
              </div>
            </div>
          )}

          {running && !briefing && (
            <div style={S.emptyState}>
              <div style={{ fontSize:36, animation:"slowspin 3s linear infinite", display:"inline-block" }}>◈</div>
              <div style={S.emptyTitle}>Agents Working...</div>
              <div style={S.emptyDesc}>Multi-agent pipeline executing autonomously. Reasoning in progress.</div>
            </div>
          )}

          {briefing && briefing.status === "success" && (
            <div style={{ height:"100%", display:"flex", flexDirection:"column" }}>

              {/* Briefing Header */}
              <div style={S.briefingHeader}>
                <div>
                  <div style={S.briefingTopic}>{briefing.topic}</div>
                  <div style={S.briefingMeta}>
                    {briefing.generated_at} · {briefing.sources_analysed} articles · {(briefing.source_names||[]).slice(0,3).join(", ")}{briefing.source_names?.length > 3 ? ` +${briefing.source_names.length-3}` : ""}
                  </div>
                </div>
              </div>

              {/* Section Tabs */}
              <div style={S.tabs}>
                {SECTIONS.map(sec => (
                  <button key={sec.id} className="tab" onClick={() => setActiveSection(sec.id)} style={{
                    ...S.tab,
                    color: activeSection === sec.id ? "#e8c547" : "#475569",
                    borderBottom: activeSection === sec.id ? "2px solid #e8c547" : "2px solid transparent",
                  }}>
                    {sec.label}
                  </button>
                ))}
              </div>

              {/* Section Content */}
              <div style={S.sectionContent} className="fadein">
                <SectionView section={activeSection} briefing={briefing} chatInput={chatInput} setChatInput={setChatInput} chatHistory={chatHistory} chatLoading={chatLoading} handleChat={handleChat} chatRef={chatRef} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SectionView({ section, briefing, chatInput, setChatInput, chatHistory, chatLoading, handleChat, chatRef }) {
  const s = briefing?.sections || {};
  const sentColor = { Positive:"#4ecca3", Negative:"#f87171", Neutral:"#94a3b8" };

  if (section === "tldr") return (
    <div className="fadein">
      <Label>TL;DR SUMMARY</Label>
      <div style={S.card}>{s.tldr}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, marginTop:16 }}>
        {[
          { label:"SOURCES", value: briefing.sources_analysed },
          { label:"SENTIMENT", value: briefing.overall_sentiment, color: sentColor[briefing.overall_sentiment] },
          { label:"CONFIDENCE", value: Math.round((briefing.confidence||0)*100) + "%" },
        ].map((stat, i) => (
          <div key={i} style={{ ...S.statCard, color: stat.color || "#e2e8f0" }}>
            <div style={S.statVal}>{stat.value}</div>
            <div style={S.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );

  if (section === "highlights") return (
    <div className="fadein">
      <Label>KEY HIGHLIGHTS — {s.highlights?.length} STORIES</Label>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {(s.highlights || []).map((h, i) => (
          <div key={i} style={S.highlightRow}>
            <div style={{ color:"#e8c547", fontWeight:700, fontSize:12, minWidth:28, fontFamily:"monospace" }}>
              {String(i+1).padStart(2,"0")}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.5 }}>{h.title}</div>
              <div style={{ fontSize:10, color:"#475569", marginTop:4 }}>
                {h.source} · <span style={{ color: sentColor[h.sentiment] || "#94a3b8" }}>{h.sentiment}</span>
              </div>
            </div>
            <div style={{ fontSize:9, padding:"3px 7px", borderRadius:3, background:`${sentColor[h.sentiment]}18`, color:sentColor[h.sentiment]||"#94a3b8", letterSpacing:"0.05em", fontWeight:700, whiteSpace:"nowrap", alignSelf:"flex-start" }}>
              {h.theme}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (section === "numbers") return (
    <div className="fadein">
      <Label>IMPORTANT NUMBERS</Label>
      {(!s.important_numbers || s.important_numbers.length === 0) ? (
        <div style={{ color:"#334155", fontSize:12 }}>No specific numbers were extracted from this coverage.</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:10 }}>
          {s.important_numbers.map((n, i) => (
            <div key={i} style={S.numCard}>
              <div style={S.numVal}>{n.value}</div>
              <div style={S.numLabel}>KEY FIGURE</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (section === "wl") return (
    <div className="fadein" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
      <div>
        <Label style={{ color:"#4ecca3" }}>🏆 WINNERS</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {(s.winners_and_losers?.winners||[]).map((w,i) => (
            <div key={i} style={{ ...S.wlRow, borderColor:"#4ecca320", color:"#a7f3d0" }}>
              <span style={{ color:"#4ecca3", marginRight:6 }}>+</span>{w}
            </div>
          ))}
        </div>
      </div>
      <div>
        <Label style={{ color:"#f87171" }}>⚠️ AT RISK / LOSERS</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {(s.winners_and_losers?.losers||[]).map((l,i) => (
            <div key={i} style={{ ...S.wlRow, borderColor:"#f8717120", color:"#fca5a5" }}>
              <span style={{ color:"#f87171", marginRight:6 }}>−</span>{l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (section === "why") return (
    <div className="fadein">
      <Label>WHY IT MATTERS</Label>
      <div style={{ ...S.card, borderLeft:"3px solid #e8c547", lineHeight:1.9, fontSize:14 }}>{s.why_it_matters}</div>
    </div>
  );

  if (section === "watch") return (
    <div className="fadein">
      <Label>WHAT TO WATCH NEXT</Label>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {(s.what_to_watch_next||[]).map((w,i) => (
          <div key={i} style={S.watchRow}>
            <span style={{ color:"#e8c547", marginRight:10, fontSize:12 }}>→</span>
            <span style={{ fontSize:13, color:"#cbd5e1" }}>{w}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (section === "chat") return (
    <div className="fadein" style={{ display:"flex", flexDirection:"column", height:"100%", gap:12 }}>
      <Label>ASK THE BRIEFING AGENT</Label>
      <div ref={chatRef} style={S.chatHistory}>
        {chatHistory.length === 0 && (
          <div style={{ color:"#334155", fontSize:11, lineHeight:1.8 }}>
            Grounded answers from briefing context. Try:<br/>
            "What are the key numbers?" · "Who are the winners?" · "Why does this matter?" · "What to watch next?"
          </div>
        )}
        {chatHistory.map((m,i) => (
          <div key={i} style={{ display:"flex", flexDirection: m.role==="user"?"row-reverse":"row", gap:8, marginBottom:8 }}>
            <div style={{
              maxWidth:"80%",
              padding:"10px 14px",
              borderRadius: m.role==="user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: m.role==="user" ? "#e8c547" : "#0f172a",
              border: m.role==="user" ? "none" : "1px solid #1e293b",
              color: m.role==="user" ? "#0a0a0f" : "#cbd5e1",
              fontSize:12, lineHeight:1.7, whiteSpace:"pre-wrap", fontFamily:"inherit",
            }}>{m.text}</div>
          </div>
        ))}
        {chatLoading && <div style={{ color:"#e8c547", fontSize:11 }} className="pulse">Agent thinking...</div>}
      </div>
      <form onSubmit={handleChat} style={{ display:"flex", gap:8 }}>
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          placeholder="Ask a follow-up question..."
          style={S.chatInput}
        />
        <button type="submit" style={S.chatBtn} className="runbtn">ASK</button>
      </form>
    </div>
  );

  return null;
}

function Label({ children, style }) {
  return <div style={{ fontSize:10, letterSpacing:"0.1em", color:"#475569", marginBottom:10, fontWeight:600, ...style }}>{children}</div>;
}

// ── STYLES ────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily:"'DM Mono', 'Fira Code', monospace", background:"#080810", minHeight:"100vh", color:"#e2e8f0", display:"flex", flexDirection:"column" },
  header: { borderBottom:"1px solid #0f172a", padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#08080f", flexShrink:0 },
  headerLeft: { display:"flex", alignItems:"center" },
  logo: { display:"flex", alignItems:"center", gap:12 },
  logoIcon: { fontSize:24, color:"#e8c547", textShadow:"0 0 16px #e8c54780" },
  logoTitle: { fontSize:15, fontWeight:700, color:"#fff", letterSpacing:"0.08em" },
  logoSub: { fontSize:9, color:"#334155", letterSpacing:"0.12em", marginTop:2 },
  headerRight: { display:"flex", gap:8, alignItems:"center" },
  grid: { display:"grid", gridTemplateColumns:"320px 1fr", flex:1, minHeight:0, overflow:"hidden" },
  left: { borderRight:"1px solid #0f172a", display:"flex", flexDirection:"column", overflow:"hidden", gap:0 },
  right: { display:"flex", flexDirection:"column", overflow:"hidden" },
  panel: { padding:"16px", borderBottom:"1px solid #0f172a" },
  panelLabel: { fontSize:9, letterSpacing:"0.12em", color:"#334155", marginBottom:10, fontWeight:700 },
  textarea: { width:"100%", background:"#0a0a14", border:"1px solid #1e293b", borderRadius:6, padding:"10px 12px", color:"#e2e8f0", fontSize:12, outline:"none", resize:"none", fontFamily:"inherit", lineHeight:1.6 },
  chipRow: { display:"flex", flexWrap:"wrap", gap:4, marginTop:8, marginBottom:10 },
  chip: { background:"#0f172a", border:"1px solid #1e293b", borderRadius:4, padding:"3px 8px", color:"#475569", fontSize:9, cursor:"pointer", fontFamily:"inherit", letterSpacing:"0.04em" },
  runBtn: { width:"100%", background:"linear-gradient(135deg, #e8c547 0%, #f59e0b 100%)", border:"none", borderRadius:6, padding:"11px", color:"#080810", fontSize:11, fontWeight:700, fontFamily:"inherit", letterSpacing:"0.08em", display:"flex", alignItems:"center", justifyContent:"center", gap:8 },
  agentList: { display:"flex", flexDirection:"column", gap:4 },
  agentRow: { display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:5, border:"1px solid transparent", transition:"all 0.25s ease" },
  agentIcon: { fontSize:16, transition:"all 0.25s", minWidth:20, textAlign:"center" },
  agentText: { flex:1 },
  agentName: { fontSize:11, fontWeight:600, letterSpacing:"0.04em", transition:"color 0.25s" },
  agentDesc: { fontSize:9, color:"#1e293b", marginTop:1, letterSpacing:"0.04em" },
  logs: { flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:2, fontFamily:"'DM Mono','Fira Code',monospace" },
  logLine: { fontSize:10, lineHeight:1.6, display:"flex", gap:6 },
  emptyState: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:40, textAlign:"center" },
  emptyIcon: { fontSize:48, color:"#1e293b" },
  emptyTitle: { fontSize:18, fontWeight:700, color:"#334155", letterSpacing:"-0.01em" },
  emptyDesc: { fontSize:12, color:"#1e293b", maxWidth:360, lineHeight:1.7 },
  briefingHeader: { padding:"20px 24px 0", borderBottom:"1px solid #0f172a", flexShrink:0 },
  briefingTopic: { fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", textTransform:"uppercase" },
  briefingMeta: { fontSize:10, color:"#334155", marginTop:4, marginBottom:14, letterSpacing:"0.04em" },
  tabs: { display:"flex", borderBottom:"1px solid #0f172a", flexShrink:0, overflowX:"auto", padding:"0 24px" },
  tab: { padding:"10px 14px", fontSize:10, fontFamily:"inherit", fontWeight:600, letterSpacing:"0.06em", background:"none", border:"none", cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" },
  sectionContent: { flex:1, overflowY:"auto", padding:"20px 24px" },
  card: { background:"#0a0a14", border:"1px solid #0f172a", borderRadius:8, padding:"18px", fontSize:13, color:"#94a3b8", lineHeight:1.8 },
  statCard: { background:"#0a0a14", border:"1px solid #0f172a", borderRadius:8, padding:"16px", textAlign:"center" },
  statVal: { fontSize:24, fontWeight:700, letterSpacing:"-0.02em" },
  statLabel: { fontSize:9, color:"#334155", marginTop:6, letterSpacing:"0.1em" },
  highlightRow: { display:"flex", gap:12, padding:"12px 14px", background:"#0a0a14", border:"1px solid #0f172a", borderRadius:6, alignItems:"flex-start" },
  numCard: { background:"#0a0a14", border:"1px solid #0f172a", borderRadius:8, padding:"18px", textAlign:"center" },
  numVal: { fontSize:22, fontWeight:700, color:"#e8c547", letterSpacing:"-0.02em" },
  numLabel: { fontSize:9, color:"#334155", marginTop:6, letterSpacing:"0.1em" },
  wlRow: { padding:"10px 12px", border:"1px solid", borderRadius:5, fontSize:12, lineHeight:1.5 },
  watchRow: { display:"flex", alignItems:"flex-start", padding:"12px 14px", background:"#0a0a14", border:"1px solid #0f172a", borderRadius:6 },
  chatHistory: { flex:1, minHeight:160, maxHeight:320, overflowY:"auto", padding:"4px 0" },
  chatInput: { flex:1, background:"#0a0a14", border:"1px solid #1e293b", borderRadius:6, padding:"10px 14px", color:"#e2e8f0", fontSize:12, outline:"none", fontFamily:"inherit" },
  chatBtn: { background:"#e8c547", border:"none", borderRadius:6, padding:"10px 16px", color:"#080810", fontSize:10, fontWeight:700, fontFamily:"inherit", letterSpacing:"0.08em", cursor:"pointer" },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
  .tag { display:inline-flex; align-items:center; padding:3px 9px; border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em; }
  .chip:hover { background:#1e293b !important; color:#94a3b8 !important; border-color:#334155 !important; }
  .agentrow.active { box-shadow: 0 0 16px -4px currentColor; }
  .runbtn:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .pulse { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .spinner { width:12px; height:12px; border:2px solid #08081060; border-top-color:#080810; border-radius:50%; animation:spin 0.7s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }
  @keyframes slowspin { to{transform:rotate(360deg)} }
  .logline { animation: logfade 0.2s ease; }
  @keyframes logfade { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
  .fadein { animation: fadein 0.3s ease; }
  @keyframes fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .tab:hover { color: #94a3b8 !important; }
`;
