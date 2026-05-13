const state = {
  dataset: null,
  companies: [],
  selectedTicker: "AAPL",
  compareTicker: "MSFT",
  frequency: "annual",
  chartMetric: "revenue",
  sectorFilter: "all",
  screenerSort: "issue_count",
  search: "",
};

const metricLabels = {
  revenue: "Revenue",
  net_income: "Net income",
  operating_cash_flow: "Operating cash flow",
  capital_expenditure: "Capital expenditure",
  free_cash_flow: "Free cash flow",
  assets: "Assets",
  liabilities: "Liabilities",
  total_debt: "Total debt",
  diluted_shares: "Diluted shares",
  gross_margin: "Gross margin",
  close: "Price",
  revenue_growth_yoy: "Revenue YoY",
  revenue_cagr_3y: "Revenue CAGR",
  net_margin: "Net margin",
  fcf_margin: "FCF margin",
  debt_to_assets: "Debt / assets",
  debt_to_equity: "Debt / equity",
  current_ratio: "Current ratio",
  share_dilution: "Share dilution",
  price_return: "Price return",
  fcf_yield: "FCF yield",
  issue_count: "Issues",
};

const tableMetrics = [
  "revenue",
  "net_income",
  "operating_cash_flow",
  "free_cash_flow",
  "assets",
  "total_debt",
  "diluted_shares",
  "gross_margin",
];

const svgNs = "http://www.w3.org/2000/svg";

const $ = (selector) => document.querySelector(selector);

function currentCompany() {
  return state.companies.find((company) => company.ticker === state.selectedTicker) || state.companies[0];
}

function compareCompany() {
  return state.companies.find((company) => company.ticker === state.compareTicker) || state.companies[1] || state.companies[0];
}

function latestStatement(company) {
  const rows = company.annual || [];
  return rows[rows.length - 1] || {};
}

function formatMoneyMillions(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}T`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}

function formatNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatMetric(metric, value) {
  if (metric === "gross_margin" || metric.includes("margin") || metric.includes("growth") || metric.includes("cagr") || metric.includes("yield") || metric.includes("return") || metric === "debt_to_assets" || metric === "debt_to_equity" || metric === "share_dilution") return formatPercent(value);
  if (metric === "diluted_shares") return `${formatNumber(value)}M`;
  if (metric === "close") return typeof value === "number" ? `$${value.toFixed(2)}` : "-";
  if (metric === "issue_count") return formatNumber(value);
  if (metric === "current_ratio") return typeof value === "number" ? value.toFixed(2) : "-";
  return formatMoneyMillions(value);
}

function setPressed(selector, activeValue, attrName) {
  document.querySelectorAll(selector).forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset[attrName] === activeValue ? "true" : "false");
  });
}

function renderUniverse() {
  const list = $("#universe-list");
  const search = state.search.trim().toLowerCase();
  const matches = state.companies.filter((company) => {
    return `${company.ticker} ${company.name} ${company.sector}`.toLowerCase().includes(search);
  });
  list.replaceChildren(
    ...matches.map((company) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ticker-button";
      button.setAttribute("aria-pressed", company.ticker === state.selectedTicker ? "true" : "false");
      button.innerHTML = `
        <span class="ticker-symbol">${company.ticker}</span>
        <span class="ticker-name">${company.name}</span>
      `;
      button.addEventListener("click", () => {
        state.selectedTicker = company.ticker;
        if (state.compareTicker === state.selectedTicker) {
          state.compareTicker = state.companies.find((item) => item.ticker !== company.ticker)?.ticker || company.ticker;
        }
        render();
      });
      return button;
    })
  );
}

function renderHeader() {
  const company = currentCompany();
  $("#company-kicker").textContent = `${company.ticker} / ${company.exchange}`;
  $("#company-name").textContent = company.name;
  $("#company-meta").textContent = `${company.sector} / CIK ${company.cik} / latest fixture price ${formatMetric("close", company.latest_price)}`;
  $("#demo-notice").textContent = state.dataset.warnings.join(" ");

  const select = $("#compare-select");
  select.replaceChildren(
    ...state.companies
      .filter((item) => item.ticker !== company.ticker)
      .map((item) => {
        const option = document.createElement("option");
        option.value = item.ticker;
        option.textContent = `${item.ticker} - ${item.name}`;
        option.selected = item.ticker === state.compareTicker;
        return option;
      })
  );
}

function metricCard(label, value, note) {
  const card = document.createElement("article");
  card.className = "metric-card";
  card.innerHTML = `
    <p class="metric-label">${label}</p>
    <p class="metric-value">${value}</p>
    <p class="metric-note">${note}</p>
  `;
  return card;
}

function renderMetrics() {
  const company = currentCompany();
  const latest = latestStatement(company);
  $("#metric-grid").replaceChildren(
    metricCard("Revenue", formatMoneyMillions(latest.revenue), "Latest annual period"),
    metricCard("Net margin", formatPercent(company.metrics.net_margin), "Net income / revenue"),
    metricCard("Free cash flow", formatMoneyMillions(latest.free_cash_flow), "Operating cash flow less capex"),
    metricCard("Issue count", formatNumber(company.issue_count || 0), (company.issue_flags || ["No current flags."]).slice(0, 2).join("; "))
  );
}

function renderScreenerControls() {
  const sectors = ["all", ...new Set(state.companies.map((company) => company.sector).filter(Boolean))].sort();
  $("#sector-filter").replaceChildren(
    ...sectors.map((sector) => {
      const option = document.createElement("option");
      option.value = sector;
      option.textContent = sector === "all" ? "All sectors" : sector;
      option.selected = sector === state.sectorFilter;
      return option;
    })
  );
  $("#screener-sort").value = state.screenerSort;
}

function screenerRows() {
  const rows = [...(state.dataset.screener || [])].filter((row) => {
    return state.sectorFilter === "all" || row.sector === state.sectorFilter;
  });
  rows.sort((a, b) => {
    const key = state.screenerSort;
    const av = typeof a[key] === "number" ? a[key] : -Infinity;
    const bv = typeof b[key] === "number" ? b[key] : -Infinity;
    return bv - av;
  });
  return rows;
}

function renderScreener() {
  renderScreenerControls();
  const headers = ["ticker", "sector", "issue_count", "revenue_growth_yoy", "revenue_cagr_3y", "net_margin", "fcf_yield", "debt_to_assets", "price_return", "issue_flags"];
  $("#screener-head").innerHTML = `
    <tr>
      ${headers.map((header) => `<th>${metricLabels[header] || header.replaceAll("_", " ")}</th>`).join("")}
    </tr>
  `;
  $("#screener-body").replaceChildren(
    ...screenerRows().map((row) => {
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.dataset.ticker = row.ticker;
      tr.innerHTML = headers
        .map((header) => {
          const value = header === "ticker" || header === "sector" || header === "issue_flags" ? row[header] : formatMetric(header, row[header]);
          return `<td>${value || "-"}</td>`;
        })
        .join("");
      tr.addEventListener("click", () => {
        state.selectedTicker = row.ticker;
        if (state.compareTicker === row.ticker) {
          state.compareTicker = state.companies.find((item) => item.ticker !== row.ticker)?.ticker || row.ticker;
        }
        render();
      });
      tr.addEventListener("keydown", (event) => {
        if (event.key === "Enter") tr.click();
      });
      return tr;
    })
  );
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(svgNs, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function seriesFor(company, metric) {
  if (metric === "close") {
    return company.prices.map((row) => ({ label: row.date.slice(0, 7), value: row.close }));
  }
  return (company[state.frequency] || [])
    .filter((row) => typeof row[metric] === "number")
    .map((row) => ({ label: row.period, value: row[metric] }));
}

function pathFor(points, min, max, width, height, pad) {
  if (!points.length) return "";
  const span = max - min || 1;
  return points
    .map((point, index) => {
      const x = pad.left + (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
      const y = pad.top + ((max - point.value) / span) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function drawSeries(svg, points, min, max, pad, className) {
  const width = 760 - pad.left - pad.right;
  const height = 260 - pad.top - pad.bottom;
  svg.appendChild(svgElement("path", { class: `chart-line ${className}`, d: pathFor(points, min, max, width, height, pad) }));
  points.forEach((point, index) => {
    const x = pad.left + (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
    const y = pad.top + ((max - point.value) / (max - min || 1)) * height;
    svg.appendChild(svgElement("circle", { class: `chart-dot ${className}`, cx: x, cy: y, r: 5 }));
  });
}

function renderChart() {
  const company = currentCompany();
  const peer = compareCompany();
  const primary = seriesFor(company, state.chartMetric);
  const secondary = seriesFor(peer, state.chartMetric);
  const svg = $("#trend-chart");
  svg.setAttribute("viewBox", "0 0 760 260");
  svg.replaceChildren();
  $("#chart-title").textContent = metricLabels[state.chartMetric];
  setPressed("[data-chart-metric]", state.chartMetric, "chartMetric");

  const allValues = [...primary, ...secondary].map((point) => point.value).filter((value) => typeof value === "number");
  if (!allValues.length) {
    svg.appendChild(svgElement("text", { class: "chart-empty", x: 32, y: 132 }));
    svg.lastChild.textContent = "No numeric data for this metric.";
    return;
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const pad = { top: 24, right: 28, bottom: 42, left: 70 };
  const width = 760 - pad.left - pad.right;
  const height = 260 - pad.top - pad.bottom;
  const yMin = min > 0 ? 0 : min;
  const yMax = max * 1.08;

  svg.appendChild(svgElement("line", { class: "chart-axis", x1: pad.left, y1: pad.top + height, x2: pad.left + width, y2: pad.top + height }));
  svg.appendChild(svgElement("line", { class: "chart-axis", x1: pad.left, y1: pad.top, x2: pad.left, y2: pad.top + height }));
  drawSeries(svg, primary, yMin, yMax, pad, "");
  drawSeries(svg, secondary, yMin, yMax, pad, "compare");

  const labelEvery = state.chartMetric === "close" ? 6 : 1;
  primary.forEach((point, index) => {
    if (index % labelEvery !== 0 && index !== primary.length - 1) return;
    const x = pad.left + (primary.length === 1 ? width / 2 : (index / (primary.length - 1)) * width);
    const text = svgElement("text", { class: "chart-tick", x, y: 246, "text-anchor": "middle" });
    text.textContent = point.label;
    svg.appendChild(text);
  });

  const legend = svgElement("text", { class: "chart-label", x: pad.left, y: 18 });
  legend.textContent = `${company.ticker} solid / ${peer.ticker} dashed`;
  svg.appendChild(legend);

  const scale = svgElement("text", { class: "chart-label", x: 756, y: 18, "text-anchor": "end" });
  scale.textContent = state.chartMetric === "close" || state.chartMetric === "gross_margin" ? "raw" : "USD millions";
  svg.appendChild(scale);
}

function renderCompare() {
  const company = currentCompany();
  const peer = compareCompany();
  const left = latestStatement(company);
  const right = latestStatement(peer);
  $("#compare-title").textContent = `${company.ticker} vs ${peer.ticker}`;
  const metrics = ["revenue", "net_income", "free_cash_flow", "total_debt"];
  $("#compare-grid").replaceChildren(
    ...metrics.map((metric) => {
      const row = document.createElement("div");
      row.className = "compare-row";
      row.innerHTML = `
        <span class="compare-label">${metricLabels[metric]}</span>
        <span class="compare-value">${company.ticker}: ${formatMetric(metric, left[metric])}</span>
        <span class="compare-value">${peer.ticker}: ${formatMetric(metric, right[metric])}</span>
      `;
      return row;
    })
  );
}

function renderQuality() {
  const company = currentCompany();
  const rows = [
    ...company.fetch_status.map((item) => ({
      label: item.source,
      status: item.status,
      detail: item.detail,
    })),
    {
      label: "missing fields",
      status: company.missing_fields.length ? "review" : "ok",
      detail: company.missing_fields.length ? company.missing_fields.join(", ") : "No missing fixture fields.",
    },
    {
      label: "freshness",
      status: "fixture",
      detail: `${company.data_freshness.yahoo}; ${company.data_freshness.sec}`,
    },
  ];

  $("#quality-list").replaceChildren(
    ...rows.map((item) => {
      const row = document.createElement("div");
      row.className = "quality-row";
      row.dataset.status = item.status;
      row.innerHTML = `
        <span class="quality-label">${item.label}</span>
        <span class="badge">${item.status}</span>
        <p class="quality-detail">${item.detail}</p>
      `;
      return row;
    })
  );
}

function renderConcepts() {
  const company = currentCompany();
  const rows = company.sec_concepts || [];
  const headers = ["metric", "concept", "unit", "forms", "period_count", "latest_filed_at", "source"];
  $("#concept-title").textContent = `${company.ticker} CompanyFacts inventory`;
  $("#concept-head").innerHTML = `
    <tr>
      ${headers.map((header) => `<th>${header.replaceAll("_", " ")}</th>`).join("")}
    </tr>
  `;
  $("#concept-body").replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = headers.map((header) => `<td>${row[header] ?? "-"}</td>`).join("");
      return tr;
    })
  );
}

function renderTable() {
  const company = currentCompany();
  const rows = company[state.frequency] || [];
  setPressed("[data-frequency]", state.frequency, "frequency");
  $("#statement-head").innerHTML = `
    <tr>
      <th>Period</th>
      ${tableMetrics.map((metric) => `<th>${metricLabels[metric]}</th>`).join("")}
    </tr>
  `;
  $("#statement-body").replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.period}</td>
        ${tableMetrics.map((metric) => `<td>${formatMetric(metric, row[metric])}</td>`).join("")}
      `;
      return tr;
    })
  );
}

function render() {
  renderUniverse();
  renderHeader();
  renderMetrics();
  renderScreener();
  renderChart();
  renderCompare();
  renderQuality();
  renderConcepts();
  renderTable();
}

async function init() {
  const response = await fetch("data/research-demo.json", { cache: "no-store" });
  state.dataset = await response.json();
  state.companies = state.dataset.companies;
  state.selectedTicker = state.companies[0]?.ticker || "AAPL";
  state.compareTicker = state.companies[1]?.ticker || state.selectedTicker;

  $("#ticker-search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderUniverse();
  });

  $("#compare-select").addEventListener("change", (event) => {
    state.compareTicker = event.target.value;
    render();
  });

  $("#sector-filter").addEventListener("change", (event) => {
    state.sectorFilter = event.target.value;
    renderScreener();
  });

  $("#screener-sort").addEventListener("change", (event) => {
    state.screenerSort = event.target.value;
    renderScreener();
  });

  document.querySelectorAll("[data-frequency]").forEach((button) => {
    button.addEventListener("click", () => {
      state.frequency = button.dataset.frequency;
      render();
    });
  });

  document.querySelectorAll("[data-chart-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      state.chartMetric = button.dataset.chartMetric;
      render();
    });
  });

  render();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="workspace"><div class="demo-notice">Failed to load demo data: ${error.message}</div></main>`;
});
