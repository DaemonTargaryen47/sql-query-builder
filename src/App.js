import React, { useState } from 'react';
import { Database, Copy, Check, Sparkles, ChevronDown } from 'lucide-react';

const ACCENT = '#7c3aed';

const TEMPLATES = [
  {
    pattern: /top (\d+)?\s*(\w+)\s+by\s+(\w+)/i,
    build: (m, table) => {
      const n = m[1] || 10;
      const groupCol = m[2];
      const orderCol = m[3];
      return `SELECT ${groupCol}, SUM(${orderCol}) AS total_${orderCol}\nFROM ${table}\nGROUP BY ${groupCol}\nORDER BY total_${orderCol} DESC\nLIMIT ${n};`;
    }
  },
  {
    pattern: /(average|avg)\s+(\w+)\s+by\s+(\w+)/i,
    build: (m, table) => `SELECT ${m[3]}, ROUND(AVG(${m[2]}), 2) AS avg_${m[2]}\nFROM ${table}\nGROUP BY ${m[3]}\nORDER BY avg_${m[2]} DESC;`
  },
  {
    pattern: /(count|number of)\s+(\w+)\s+by\s+(\w+)/i,
    build: (m, table) => `SELECT ${m[3]}, COUNT(${m[2]}) AS total_${m[2]}\nFROM ${table}\nGROUP BY ${m[3]}\nORDER BY total_${m[2]} DESC;`
  },
  {
    pattern: /(total|sum)\s+(\w+)\s+by\s+(\w+)/i,
    build: (m, table) => `SELECT ${m[3]}, SUM(${m[2]}) AS total_${m[2]}\nFROM ${table}\nGROUP BY ${m[3]}\nORDER BY total_${m[2]} DESC;`
  },
  {
    pattern: /(\w+)\s+greater than\s+(\d+)/i,
    build: (m, table) => `SELECT *\nFROM ${table}\nWHERE ${m[1]} > ${m[2]};`
  },
  {
    pattern: /(\w+)\s+less than\s+(\d+)/i,
    build: (m, table) => `SELECT *\nFROM ${table}\nWHERE ${m[1]} < ${m[2]};`
  },
  {
    pattern: /(\w+)\s+equal(s)? to?\s+['"]?(\w+)['"]?/i,
    build: (m, table) => `SELECT *\nFROM ${table}\nWHERE ${m[1]} = '${m[3]}';`
  },
  {
    pattern: /monthly\s+(\w+)/i,
    build: (m, table) => `SELECT DATE_TRUNC('month', order_date) AS month, SUM(${m[1]}) AS total_${m[1]}\nFROM ${table}\nGROUP BY DATE_TRUNC('month', order_date)\nORDER BY month;`
  },
  {
    pattern: /distinct\s+(\w+)/i,
    build: (m, table) => `SELECT DISTINCT ${m[1]}\nFROM ${table};`
  },
  {
    pattern: /join\s+(\w+)\s+and\s+(\w+)\s+on\s+(\w+)/i,
    build: (m) => `SELECT *\nFROM ${m[1]} a\nJOIN ${m[2]} b ON a.${m[3]} = b.${m[3]};`
  }
];

const EXAMPLES = [
  'top 5 products by sales',
  'average price by category',
  'count orders by region',
  'total revenue by month',
  'price greater than 100',
  'distinct customer_id',
  'monthly revenue'
];

function generateSQL(input, table) {
  const cleaned = input.trim();
  if (!cleaned) return null;

  for (const t of TEMPLATES) {
    const match = cleaned.match(t.pattern);
    if (match) {
      return t.build(match, table || 'your_table');
    }
  }

  // fallback: generic SELECT with WHERE-like guess
  const words = cleaned.toLowerCase().split(' ');
  if (words.includes('all') || words.includes('everything')) {
    return `SELECT *\nFROM ${table || 'your_table'};`;
  }

  return `-- Couldn't fully parse that request.\n-- Try phrasing it like one of the examples below,\n-- or write the WHERE/GROUP BY condition more explicitly.\nSELECT *\nFROM ${table || 'your_table'}\nLIMIT 100;`;
}

export default function SQLQueryBuilder() {
  const [input, setInput] = useState('');
  const [table, setTable] = useState('orders');
  const [sql, setSql] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);

  const handleGenerate = () => {
    if (!input.trim()) return;
    const result = generateSQL(input, table);
    setSql(result);
    setHistory(prev => [{ query: input, sql: result }, ...prev].slice(0, 5));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const applyExample = (ex) => {
    setInput(ex);
    const result = generateSQL(ex, table);
    setSql(result);
    setHistory(prev => [{ query: ex, sql: result }, ...prev].slice(0, 5));
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#faf9fc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#1e1b2e',
      padding: '2rem 1.5rem'
    }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Database size={18} color="white" />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              Plain English → SQL
            </h1>
          </div>
          <p style={{ color: '#6b6478', fontSize: '0.95rem', margin: 0 }}>
            Describe what you want in plain English. Get a working SQL query back.
          </p>
        </div>

        {/* Table name input */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b6478', marginBottom: '0.3rem', display: 'block' }}>
            Table name
          </label>
          <input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="e.g. orders"
            style={{
              width: '100%', padding: '0.6rem 0.9rem', borderRadius: '8px',
              border: '1px solid #e4e0ec', fontSize: '0.9rem', outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Main input */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b6478', marginBottom: '0.3rem', display: 'block' }}>
            What do you want to know?
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            placeholder="e.g. top 5 products by sales"
            rows={2}
            style={{
              width: '100%', padding: '0.8rem 0.9rem', borderRadius: '10px',
              border: '1px solid #e4e0ec', fontSize: '0.95rem', outline: 'none',
              fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
            }}
          />
        </div>

        <button
          onClick={handleGenerate}
          style={{
            background: ACCENT, color: 'white', border: 'none', borderRadius: '8px',
            padding: '0.65rem 1.4rem', fontSize: '0.88rem', fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '1.5rem'
          }}
        >
          <Sparkles size={15} /> Generate SQL
        </button>

        {/* Examples */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Try an example:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => applyExample(ex)}
                style={{
                  background: '#f3f0f9', border: '1px solid #e4e0ec', borderRadius: '20px',
                  padding: '0.3rem 0.7rem', fontSize: '0.78rem', color: '#5b21b6', cursor: 'pointer'
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Output */}
        {sql && (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b6478' }}>Generated SQL</span>
              <button
                onClick={handleCopy}
                style={{
                  background: 'none', border: '1px solid #e4e0ec', borderRadius: '6px',
                  padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#6b6478'
                }}
              >
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <pre style={{
              background: '#1e1b2e', color: '#e9e4f5', padding: '1.1rem',
              borderRadius: '10px', fontSize: '0.85rem', overflowX: 'auto',
              fontFamily: "'JetBrains Mono', 'Courier New', monospace", lineHeight: 1.6, margin: 0
            }}>
              {sql}
            </pre>
          </div>
        )}

        {/* History */}
        {history.length > 1 && (
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b6478', marginBottom: '0.6rem' }}>
              Recent queries
            </div>
            {history.slice(1).map((h, i) => (
              <div
                key={i}
                onClick={() => { setInput(h.query); setSql(h.sql); }}
                style={{
                  padding: '0.6rem 0.9rem', background: 'white', border: '1px solid #e4e0ec',
                  borderRadius: '8px', marginBottom: '0.4rem', cursor: 'pointer', fontSize: '0.83rem'
                }}
              >
                {h.query}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '2.5rem', fontSize: '0.78rem', color: '#a8a2b8', lineHeight: 1.6 }}>
          Supports patterns like: top N by column, average/total/count by column, comparisons (greater/less than), distinct values, monthly aggregates, and simple joins. For anything more complex, use the output as a starting point and refine manually.
        </div>
      </div>
    </div>
  );
}