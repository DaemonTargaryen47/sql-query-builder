import React, { useState } from 'react';
import { Database, Copy, Check, Sparkles, Plus, Trash2, Table, Download } from 'lucide-react';

const ACCENT = '#a78bfa';
const BG = '#0f0f1a';
const SURFACE = '#1a1a2e';
const CARD = '#222240';
const BORDER = '#2e2e50';
const TEXT_PRIMARY = '#ede9fe';
const TEXT_SECONDARY = '#9d99b8';
const TEXT_MUTED = '#5c5880';

const DIALECTS = {
  postgresql: { label: 'PostgreSQL' },
  mysql: { label: 'MySQL' },
  sqlite: { label: 'SQLite' },
  sqlserver: { label: 'SQL Server' },
};

// Returns a SELECT clause prefix that inserts TOP n for SQL Server, empty otherwise
function selectTop(dialect, n) {
  return dialect === 'sqlserver' ? `SELECT TOP ${n} ` : `SELECT `;
}

// Returns the trailing LIMIT clause, empty for SQL Server since TOP is used instead
function limitClause(dialect, n) {
  return dialect === 'sqlserver' ? '' : `\nLIMIT ${n}`;
}

function monthTrunc(dialect, dateCol) {
  switch (dialect) {
    case 'mysql':
      return `DATE_FORMAT(${dateCol}, '%Y-%m')`;
    case 'sqlite':
      return `strftime('%Y-%m', ${dateCol})`;
    case 'sqlserver':
      return `FORMAT(${dateCol}, 'yyyy-MM')`;
    default:
      return `DATE_TRUNC('month', ${dateCol})`;
  }
}

function buildTemplates(dialect) {
  return [
    {
      pattern: /top (\d+)?\s*(\w+)\s+by\s+(\w+)/i,
      build: (m, table) => {
        const n = m[1] || 10;
        const groupCol = m[2];
        const orderCol = m[3];
        return `${selectTop(dialect, n)}${groupCol}, SUM(${orderCol}) AS total_${orderCol}\nFROM ${table}\nGROUP BY ${groupCol}\nORDER BY total_${orderCol} DESC${limitClause(dialect, n)};`;
      }
    },
    {
      pattern: /(bottom|worst|lowest)\s+(\d+)?\s*(\w+)/i,
      build: (m, table) => {
        const n = m[2] || 10;
        const col = m[3];
        return `${selectTop(dialect, n)}*\nFROM ${table}\nORDER BY ${col} ASC${limitClause(dialect, n)};`;
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
      build: (m, table) => {
        const trunc = monthTrunc(dialect, 'order_date');
        return `SELECT ${trunc} AS month, SUM(${m[1]}) AS total_${m[1]}\nFROM ${table}\nGROUP BY ${trunc}\nORDER BY month;`;
      }
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
}

const EXAMPLES = [
  'top 5 products by sales',
  'worst 5 products by price',
  'average price by category',
  'count orders by region',
  'total revenue by month',
  'price greater than 100',
  'price greater than 100 and category equals electronics',
  'age greater than 18 and status equals active',
  'salary less than 50000 or department equals sales',
  'name contains john',
  'price between 100 and 500',
  'distinct customer_id',
  'monthly revenue'
];

function parseSingleCondition(text) {
  const patterns = [
    { regex: /(\w+)\s+greater than\s+(\d+)/i,                     build: (m) => `${m[1]} > ${m[2]}` },
    { regex: /(\w+)\s+less than\s+(\d+)/i,                        build: (m) => `${m[1]} < ${m[2]}` },
    { regex: /(\w+)\s+not equal(?:s)?(?:\s+to)?\s+['"]?(\w+)['"]?/i, build: (m) => `${m[1]} != '${m[2]}'` },
    { regex: /(\w+)\s+equal(?:s)?(?:\s+to)?\s+['"]?(\w+)['"]?/i,     build: (m) => `${m[1]} = '${m[2]}'` },
    { regex: /(\w+)\s+between\s+(\d+)\s+and\s+(\d+)/i,           build: (m) => `${m[1]} BETWEEN ${m[2]} AND ${m[3]}` },
    { regex: /(\w+)\s+contains\s+['"]?(\w+)['"]?/i,               build: (m) => `${m[1]} LIKE '%${m[2]}%'` },
    { regex: /(\w+)\s+starts with\s+['"]?(\w+)['"]?/i,           build: (m) => `${m[1]} LIKE '${m[2]}%'` },
    { regex: /(\w+)\s+ends with\s+['"]?(\w+)['"]?/i,             build: (m) => `${m[1]} LIKE '%${m[2]}'` },
    { regex: /(\w+)\s+is not null/i,                               build: (m) => `${m[1]} IS NOT NULL` },
    { regex: /(\w+)\s+is null/i,                                   build: (m) => `${m[1]} IS NULL` },
  ];

  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match) return p.build(match);
  }
  return null;
}

function parseMultiCondition(input) {
  // Protect "between X and Y" from being split on its internal "and"
  // by temporarily swapping that "and" for a placeholder token.
  const PLACEHOLDER = '__BETWEEN_AND__';
  const protectedInput = input.replace(
    /(\w+\s+between\s+\d+)\s+and\s+(\d+)/gi,
    `$1 ${PLACEHOLDER} $2`
  );

  const parts = protectedInput.split(/\s+(and|or)\s+/i);
  const clauses = [];
  const operators = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // restore the placeholder back to "and" before parsing this clause
      const restored = parts[i].replace(new RegExp(PLACEHOLDER, 'g'), 'and');
      const cond = parseSingleCondition(restored);
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

function findJoinKey(table1, table2, tables) {
  const t1 = tables.find(t => t.name === table1);
  const t2 = tables.find(t => t.name === table2);
  if (!t1 || !t2) return null;
  const cols1 = t1.columns.split(',').map(c => c.trim().split(' ')[0].toLowerCase());
  const cols2 = t2.columns.split(',').map(c => c.trim().split(' ')[0].toLowerCase());
  return cols1.find(c => cols2.includes(c)) || null;
}

function sanitizeTableName(name) {
  const cleaned = (name || '').trim().replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || 'your_table';
}

function generateSchemaSQL(input, tables, dialect) {
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;

  const TEMPLATES = buildTemplates(dialect);
  const mentionedTables = tables.filter(t => cleaned.includes(t.name.toLowerCase()));

  if (mentionedTables.length >= 2) {
    const t1 = mentionedTables[0].name;
    const t2 = mentionedTables[1].name;
    const joinKey = findJoinKey(t1, t2, tables);
    if (joinKey) {
      const whereClause = parseMultiCondition(cleaned);
      return `SELECT *\nFROM ${t1}\nJOIN ${t2} ON ${t1}.${joinKey} = ${t2}.${joinKey}${whereClause ? `\nWHERE ${whereClause}` : ''};`;
    }
  }

  const primaryTable = mentionedTables[0]?.name || tables[0]?.name || 'your_table';

  for (const t of TEMPLATES) {
    const match = cleaned.match(t.pattern);
    if (match) return t.build(match, primaryTable);
  }

  const whereClause = parseMultiCondition(cleaned);
  if (whereClause) return `SELECT *\nFROM ${primaryTable}\nWHERE ${whereClause};`;

  if (cleaned.includes('all') || cleaned.includes('everything')) {
    return `SELECT *\nFROM ${primaryTable};`;
  }

  const schemaHint = tables.map(t => `--   ${t.name}(${t.columns})`).join('\n');
  return `-- Couldn't fully parse that request.\n-- Your schema:\n${schemaHint}\nSELECT *\nFROM ${primaryTable}\nLIMIT 100;`;
}

function generateSQL(input, table, tables, dialect) {
  const safeTable = sanitizeTableName(table);
  const TEMPLATES = buildTemplates(dialect);

  if (tables && tables.length > 0 && tables[0].name) {
    return generateSchemaSQL(input, tables, dialect);
  }

  const cleaned = input.trim();
  if (!cleaned) return null;

  for (const t of TEMPLATES) {
    const match = cleaned.match(t.pattern);
    if (match) return t.build(match, safeTable);
  }

  const whereClause = parseMultiCondition(cleaned);
  if (whereClause) return `SELECT *\nFROM ${safeTable}\nWHERE ${whereClause};`;

  const words = cleaned.toLowerCase().split(' ');
  if (words.includes('all') || words.includes('everything')) {
    return `SELECT *\nFROM ${safeTable};`;
  }

  return `-- Couldn't fully parse that request.\n-- Try phrasing it like one of the examples below.\nSELECT *\nFROM ${safeTable}\nLIMIT 100;`;
}

const inputStyle = {
  width: '100%',
  padding: '0.65rem 0.9rem',
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  fontSize: '0.9rem',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  background: CARD,
  color: TEXT_PRIMARY,
};

function SchemaBuilder({ tables, setTables }) {
  const addTable = () => setTables(prev => [...prev, { id: Date.now(), name: '', columns: '' }]);
  const removeTable = (id) => setTables(prev => prev.filter(t => t.id !== id));
  const updateTable = (id, field, value) =>
    setTables(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: TEXT_SECONDARY }}>
          Schema — define your tables for smarter queries
        </label>
        <button onClick={addTable} style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: '6px',
          padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: ACCENT,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem'
        }}>
          <Plus size={12} /> Add Table
        </button>
      </div>

      {tables.length === 0 && (
        <div style={{
          padding: '0.8rem', background: CARD, border: `1px dashed ${BORDER}`,
          borderRadius: '8px', fontSize: '0.78rem', color: TEXT_MUTED, textAlign: 'center'
        }}>
          Click "Add Table" to define your tables and columns for smarter SQL generation.
        </div>
      )}

      {tables.map((t) => (
        <div key={t.id} style={{
          background: CARD, border: `1px solid ${BORDER}`,
          borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <div style={{ paddingTop: '0.5rem' }}><Table size={14} color={ACCENT} /></div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input
                value={t.name}
                onChange={(e) => updateTable(t.id, 'name', e.target.value)}
                placeholder="Table name (e.g. orders)"
                style={{ ...inputStyle }}
              />
              <input
                value={t.columns}
                onChange={(e) => updateTable(t.id, 'columns', e.target.value)}
                placeholder="Columns (e.g. id INT, customer_id INT, price DECIMAL, category VARCHAR)"
                style={{ ...inputStyle }}
              />
            </div>
            <button onClick={() => removeTable(t.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: TEXT_MUTED, paddingTop: '0.4rem'
            }}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}

      {tables.length >= 2 && (
        <div style={{ fontSize: '0.75rem', color: TEXT_MUTED, marginTop: '0.3rem' }}>
          💡 Shared column names across tables will be used for automatic JOINs.
        </div>
      )}
    </div>
  );
}

export default function SQLQueryBuilder() {
  const [input, setInput] = useState('');
  const [table, setTable] = useState('orders');
  const [tables, setTables] = useState([]);
  const [sql, setSql] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [showSchema, setShowSchema] = useState(false);
  const [dialect, setDialect] = useState('postgresql');

  const handleGenerate = () => {
    if (!input.trim()) return;
    const result = generateSQL(input, table, tables, dialect);
    setSql(result);
    setHistory(prev => [{ query: input, sql: result }, ...prev].slice(0, 5));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyExample = (ex) => {
    setInput(ex);
    const result = generateSQL(ex, table, tables, dialect);
    setSql(result);
    setHistory(prev => [{ query: ex, sql: result }, ...prev].slice(0, 5));
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: BG,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: TEXT_PRIMARY,
      padding: '2rem 1.5rem'
    }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px', background: ACCENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Database size={18} color="#0f0f1a" />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: TEXT_PRIMARY }}>
              Plain English → SQL
            </h1>
          </div>
          <p style={{ color: TEXT_SECONDARY, fontSize: '0.95rem', margin: 0 }}>
            Describe what you want in plain English. Get a working SQL query back.
          </p>
        </div>

        {/* Dialect Switcher */}
        <div style={{ marginBottom: '1.2rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: TEXT_SECONDARY, marginBottom: '0.4rem', display: 'block' }}>
            Database dialect
          </label>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {Object.entries(DIALECTS).map(([key, val]) => (
              <button
                key={key}
                onClick={() => setDialect(key)}
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.8rem',
                  fontWeight: 600, cursor: 'pointer', border: '1px solid',
                  borderColor: dialect === key ? ACCENT : BORDER,
                  background: dialect === key ? ACCENT : CARD,
                  color: dialect === key ? '#0f0f1a' : TEXT_SECONDARY,
                  transition: 'all 0.15s'
                }}
              >
                {val.label}
              </button>
            ))}
          </div>
        </div>

        {/* Schema Toggle */}
        <button
          onClick={() => setShowSchema(s => !s)}
          style={{
            background: showSchema ? SURFACE : CARD,
            border: `1px solid ${showSchema ? ACCENT : BORDER}`,
            borderRadius: '8px', padding: '0.5rem 1rem',
            fontSize: '0.82rem', fontWeight: 600,
            color: showSchema ? ACCENT : TEXT_SECONDARY,
            cursor: 'pointer', marginBottom: '1rem',
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem'
          }}
        >
          <Table size={13} /> {showSchema ? 'Hide Schema' : 'Define Schema'}
          {tables.length > 0 && (
            <span style={{
              background: ACCENT, color: '#0f0f1a', borderRadius: '10px',
              padding: '0.1rem 0.45rem', fontSize: '0.7rem', fontWeight: 700
            }}>
              {tables.length}
            </span>
          )}
        </button>

        {showSchema && <SchemaBuilder tables={tables} setTables={setTables} />}

        {/* Table name — only if no schema */}
        {tables.length === 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: TEXT_SECONDARY, marginBottom: '0.3rem', display: 'block' }}>
              Table name
            </label>
            <input
              value={table}
              onChange={(e) => setTable(e.target.value)}
              placeholder="e.g. orders"
              style={inputStyle}
            />
          </div>
        )}

        {/* Schema pills */}
        {tables.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
            {tables.filter(t => t.name).map((t, i) => (
              <span key={i} style={{
                background: CARD, border: `1px solid ${BORDER}`,
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
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: TEXT_SECONDARY, marginBottom: '0.3rem', display: 'block' }}>
            What do you want to know?
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            placeholder="e.g. price greater than 100 and category equals electronics"
            rows={2}
            style={{
              ...inputStyle,
              resize: 'vertical',
              lineHeight: 1.6,
              padding: '0.8rem 0.9rem',
            }}
          />
        </div>

        <button
          onClick={handleGenerate}
          style={{
            background: ACCENT, color: '#0f0f1a', border: 'none', borderRadius: '8px',
            padding: '0.65rem 1.4rem', fontSize: '0.88rem', fontWeight: 700,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '1.5rem'
          }}
        >
          <Sparkles size={15} /> Generate SQL
        </button>

        {/* Examples */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.78rem', color: TEXT_MUTED, marginBottom: '0.5rem' }}>Try an example:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => applyExample(ex)} style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: '20px', padding: '0.3rem 0.7rem',
                fontSize: '0.78rem', color: ACCENT, cursor: 'pointer'
              }}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Output */}
        {sql && (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: TEXT_SECONDARY }}>
                Generated SQL
                <span style={{
                  marginLeft: '0.5rem', background: CARD, color: ACCENT,
                  borderRadius: '10px', padding: '0.1rem 0.5rem', fontSize: '0.7rem',
                  border: `1px solid ${BORDER}`
                }}>
                  {DIALECTS[dialect].label}
                </span>
              </span>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={handleDownload} style={{
                  background: CARD, border: `1px solid ${BORDER}`, borderRadius: '6px',
                  padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.3rem', color: TEXT_SECONDARY
                }}>
                  <Download size={12} /> Download .sql
                </button>
                <button onClick={handleCopy} style={{
                  background: CARD, border: `1px solid ${BORDER}`, borderRadius: '6px',
                  padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.3rem', color: TEXT_SECONDARY
                }}>
                  {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
            </div>
            <pre style={{
              background: '#080810', color: '#c4b8ff', padding: '1.1rem',
              borderRadius: '10px', fontSize: '0.85rem', overflowX: 'auto',
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              lineHeight: 1.6, margin: 0, border: `1px solid ${BORDER}`
            }}>
              {sql}
            </pre>
          </div>
        )}

        {/* History */}
        {history.length > 1 && (
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: TEXT_SECONDARY, marginBottom: '0.6rem' }}>
              Recent queries
            </div>
            {history.slice(1).map((h, i) => (
              <div key={i} onClick={() => { setInput(h.query); setSql(h.sql); }} style={{
                padding: '0.6rem 0.9rem', background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: '8px', marginBottom: '0.4rem', cursor: 'pointer',
                fontSize: '0.83rem', color: TEXT_SECONDARY
              }}>
                {h.query}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '2.5rem', fontSize: '0.78rem', color: TEXT_MUTED, lineHeight: 1.6 }}>
          Supports: top/bottom N by column, aggregations, multi-condition WHERE with AND/OR, comparisons, BETWEEN, LIKE, IS NULL, distinct, monthly aggregates, auto JOINs. Switch dialects for PostgreSQL, MySQL, SQLite, and SQL Server syntax.
        </div>
      </div>
    </div>
  );
}