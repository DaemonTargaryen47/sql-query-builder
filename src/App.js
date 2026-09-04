import React, { useState } from 'react';
import { Database, Copy, Check, Sparkles, Plus, Trash2, Table } from 'lucide-react';

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
    pattern: /monthly\s+(\w+)/i,
    build: (m, table) => `SELECT DATE_TRUNC('month', order_date) AS month, SUM(${m[1]}) AS total_${m[1]}\nFROM ${table}\nGROUP BY DATE_TRUNC('month', order_date)\nORDER BY month;`
  },
  {
    pattern: /distinct\s+(\w+)/i,
    build: (m, table) => `SELECT DISTINCT ${m[1]}\nFROM ${table};`
  }
];

const EXAMPLES = [
  'top 5 products by sales',
  'average price by category',
  'count orders by region',
  'total revenue by month',
  'price greater than 100',
  'price greater than 100 and category equals electronics',
  'age greater than 18 and status equals active',
  'name contains john',
  'price between 100 and 500',
  'distinct customer_id',
  'monthly revenue'
];

function parseSingleCondition(text) {
  const patterns = [
    { regex: /(\w+)\s+greater than\s+(\d+)/i,                      build: (m) => `${m[1]} > ${m[2]}` },
    { regex: /(\w+)\s+less than\s+(\d+)/i,                         build: (m) => `${m[1]} < ${m[2]}` },
    { regex: /(\w+)\s+equal(?:s)?\s+to?\s+['"]?(\w+)['"]?/i,      build: (m) => `${m[1]} = '${m[2]}'` },
    { regex: /(\w+)\s+not equal(?:s)?\s+to?\s+['"]?(\w+)['"]?/i,  build: (m) => `${m[1]} != '${m[2]}'` },
    { regex: /(\w+)\s+between\s+(\d+)\s+and\s+(\d+)/i,            build: (m) => `${m[1]} BETWEEN ${m[2]} AND ${m[3]}` },
    { regex: /(\w+)\s+contains\s+['"]?(\w+)['"]?/i,                build: (m) => `${m[1]} LIKE '%${m[2]}%'` },
    { regex: /(\w+)\s+starts with\s+['"]?(\w+)['"]?/i,            build: (m) => `${m[1]} LIKE '${m[2]}%'` },
    { regex: /(\w+)\s+ends with\s+['"]?(\w+)['"]?/i,              build: (m) => `${m[1]} LIKE '%${m[2]}'` },
    { regex: /(\w+)\s+is not null/i,                                build: (m) => `${m[1]} IS NOT NULL` },
    { regex: /(\w+)\s+is null/i,                                    build: (m) => `${m[1]} IS NULL` },
  ];

  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match) return p.build(match);
  }
  return null;
}

function parseMultiCondition(input) {
  const parts = input.split(/\s+(and|or)\s+/i);
  const clauses = [];
  const operators = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const cond = parseSingleCondition(parts[i]);
      if (cond) clauses.push(cond);
    } else {
      operators.push(parts[i].toUpperCase());
    }
  }

  if (clauses.length === 0) return null;

  let whereClause = clauses[0];
  for (let i = 1; i < clauses.length; i++) {
    whereClause += ` ${operators[i - 1] || 'AND'} ${clauses[i]}`;
  }
  return whereClause;
}

// Find which table owns a column based on schema
function findTableForColumn(col, tables) {
  for (const t of tables) {
    const cols = t.columns.split(',').map(c => c.trim().split(' ')[0].toLowerCase());
    if (cols.includes(col.toLowerCase())) return t.name;
  }
  return null;
}

// Find shared columns between two tables for auto JOIN
function findJoinKey(table1, table2, tables) {
  const t1 = tables.find(t => t.name === table1);
  const t2 = tables.find(t => t.name === table2);
  if (!t1 || !t2) return null;

  const cols1 = t1.columns.split(',').map(c => c.trim().split(' ')[0].toLowerCase());
  const cols2 = t2.columns.split(',').map(c => c.trim().split(' ')[0].toLowerCase());

  return cols1.find(c => cols2.includes(c)) || null;
}

function generateSchemaSQL(input, tables) {
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;

  const tableNames = tables.map(t => t.name.toLowerCase());

  // Detect which tables are mentioned in the query
  const mentionedTables = tables.filter(t =>
    cleaned.includes(t.name.toLowerCase())
  );

  // If two tables mentioned, try auto JOIN
  if (mentionedTables.length >= 2) {
    const t1 = mentionedTables[0].name;
    const t2 = mentionedTables[1].name;
    const joinKey = findJoinKey(t1, t2, tables);

    if (joinKey) {
      const whereClause = parseMultiCondition(cleaned);
      return `SELECT *\nFROM ${t1}\nJOIN ${t2} ON ${t1}.${joinKey} = ${t2}.${joinKey}${whereClause ? `\nWHERE ${whereClause}` : ''};`;
    }
  }

  // Use first mentioned table or first in schema
  const primaryTable = mentionedTables[0]?.name || tables[0]?.name || 'your_table';

  // Try standard templates
  for (const t of TEMPLATES) {
    const match = cleaned.match(t.pattern);
    if (match) return t.build(match, primaryTable);
  }

  // Try multi-condition WHERE
  const whereClause = parseMultiCondition(cleaned);
  if (whereClause) {
    return `SELECT *\nFROM ${primaryTable}\nWHERE ${whereClause};`;
  }

  if (cleaned.includes('all') || cleaned.includes('everything')) {
    return `SELECT *\nFROM ${primaryTable};`;
  }

  // Build schema context hint
  const schemaHint = tables.map(t => `--   ${t.name}(${t.columns})`).join('\n');
  return `-- Couldn't fully parse that request.\n-- Your schema:\n${schemaHint}\nSELECT *\nFROM ${primaryTable}\nLIMIT 100;`;
}

function generateSQL(input, table, tables) {
  // If schema tables defined, use schema-aware generation
  if (tables && tables.length > 0 && tables[0].name) {
    return generateSchemaSQL(input, tables);
  }

  // Fallback to original single-table logic
  const cleaned = input.trim();
  if (!cleaned) return null;

  for (const t of TEMPLATES) {
    const match = cleaned.match(t.pattern);
    if (match) return t.build(match, table || 'your_table');
  }

  const whereClause = parseMultiCondition(cleaned);
  if (whereClause) {
    return `SELECT *\nFROM ${table || 'your_table'}\nWHERE ${whereClause};`;
  }

  const words = cleaned.toLowerCase().split(' ');
  if (words.includes('all') || words.includes('everything')) {
    return `SELECT *\nFROM ${table || 'your_table'};`;
  }

  return `-- Couldn't fully parse that request.\n-- Try phrasing it like one of the examples below.\nSELECT *\nFROM ${table || 'your_table'}\nLIMIT 100;`;
}

// ─── Schema Builder Component ────────────────────────────────────────────────
function SchemaBuilder({ tables, setTables }) {
  const addTable = () => {
    setTables(prev => [...prev, { id: Date.now(), name: '', columns: '' }]);
  };

  const removeTable = (id) => {
    setTables(prev => prev.filter(t => t.id !== id));
  };

  const updateTable = (id, field, value) => {
    setTables(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b6478' }}>
          Schema (optional — define your tables for smarter queries)
        </label>
        <button
          onClick={addTable}
          style={{
            background: '#f3f0f9', border: '1px solid #e4e0ec', borderRadius: '6px',
            padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: ACCENT,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem'
          }}
        >
          <Plus size={12} /> Add Table
        </button>
      </div>

      {tables.length === 0 && (
        <div style={{
          padding: '0.8rem', background: '#f9f8fc', border: '1px dashed #d4cfe8',
          borderRadius: '8px', fontSize: '0.78rem', color: '#a8a2b8', textAlign: 'center'
        }}>
          No schema defined — click "Add Table" to define your tables and columns for smarter SQL generation.
        </div>
      )}

      {tables.map((t) => (
        <div key={t.id} style={{
          background: 'white', border: '1px solid #e4e0ec', borderRadius: '8px',
          padding: '0.75rem', marginBottom: '0.5rem'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '0.5rem' }}>
              <Table size={14} color={ACCENT} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input
                value={t.name}
                onChange={(e) => updateTable(t.id, 'name', e.target.value)}
                placeholder="Table name (e.g. orders)"
                style={{
                  padding: '0.4rem 0.7rem', borderRadius: '6px', border: '1px solid #e4e0ec',
                  fontSize: '0.83rem', outline: 'none', fontFamily: 'inherit'
                }}
              />
              <input
                value={t.columns}
                onChange={(e) => updateTable(t.id, 'columns', e.target.value)}
                placeholder="Columns (e.g. id INT, customer_id INT, price DECIMAL, category VARCHAR)"
                style={{
                  padding: '0.4rem 0.7rem', borderRadius: '6px', border: '1px solid #e4e0ec',
                  fontSize: '0.83rem', outline: 'none', fontFamily: 'inherit'
                }}
              />
            </div>
            <button
              onClick={() => removeTable(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#c4b8d4', paddingTop: '0.4rem'
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}

      {tables.length >= 2 && (
        <div style={{ fontSize: '0.75rem', color: '#a8a2b8', marginTop: '0.3rem' }}>
          💡 Shared column names across tables will be used for automatic JOINs.
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SQLQueryBuilder() {
  const [input, setInput] = useState('');
  const [table, setTable] = useState('orders');
  const [tables, setTables] = useState([]);
  const [sql, setSql] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [showSchema, setShowSchema] = useState(false);

  const handleGenerate = () => {
    if (!input.trim()) return;
    const result = generateSQL(input, table, tables);
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
    const result = generateSQL(ex, table, tables);
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

        {/* Header */}
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
            Describe what you want in plain English. Define your schema for smarter, accurate queries.
          </p>
        </div>

        {/* Schema toggle */}
        <button
          onClick={() => setShowSchema(s => !s)}
          style={{
            background: showSchema ? '#f3f0f9' : 'white',
            border: `1px solid ${showSchema ? ACCENT : '#e4e0ec'}`,
            borderRadius: '8px', padding: '0.5rem 1rem',
            fontSize: '0.82rem', fontWeight: 600, color: showSchema ? ACCENT : '#6b6478',
            cursor: 'pointer', marginBottom: '1rem',
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem'
          }}
        >
          <Table size={13} /> {showSchema ? 'Hide Schema' : 'Define Schema'}
          {tables.length > 0 && (
            <span style={{
              background: ACCENT, color: 'white', borderRadius: '10px',
              padding: '0.1rem 0.45rem', fontSize: '0.7rem'
            }}>
              {tables.length}
            </span>
          )}
        </button>

        {/* Schema builder */}
        {showSchema && <SchemaBuilder tables={tables} setTables={setTables} />}

        {/* Table name input — only show if no schema defined */}
        {tables.length === 0 && (
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
        )}

        {/* Schema summary pill */}
        {tables.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
            marginBottom: '1rem'
          }}>
            {tables.filter(t => t.name).map((t, i) => (
              <span key={i} style={{
                background: '#f3f0f9', border: '1px solid #e4e0ec',
                borderRadius: '20px', padding: '0.2rem 0.7rem',
                fontSize: '0.75rem', color: ACCENT
              }}>
                {t.name}
              </span>
            ))}
          </div>
        )}

        {/* Main input */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b6478', marginBottom: '0.3rem', display: 'block' }}>
            What do you want to know?
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            placeholder="e.g. price greater than 100 and category equals electronics"
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
          Supports: top N by column, aggregations, multi-condition WHERE with AND/OR, comparisons, BETWEEN, LIKE, IS NULL, distinct, monthly aggregates. Define a schema with multiple tables for automatic JOIN detection.
        </div>
      </div>
    </div>
  );
}