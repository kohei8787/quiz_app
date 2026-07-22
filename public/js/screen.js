// サーバーへ接続
const socket = io();

// 画面要素を取得
const statusEl = document.getElementById("status");
const teamList = document.getElementById("teamList");
const currentQuestionText = document.getElementById("currentQuestionText");
const questionTitle = document.getElementById("questionTitle");
const timerValue = document.getElementById("timerValue");
const correctAnswerText = document.getElementById("correctAnswerText");
const gaugeContainer = document.getElementById("gaugeContainer");
const rankingList = document.getElementById("rankingList");
const waitingSection = document.getElementById("waitingSection");
const questionView = document.getElementById("questionView");
const surveyCard = document.getElementById("surveyCard");
const surveyQuestionText = document.getElementById("surveyQuestionText");
const surveyOptionsList = document.getElementById("surveyOptionsList");
const resultView = document.getElementById("resultView");
const resultTeamListLeft = document.getElementById("resultTeamListLeft");
const resultTeamListRight = document.getElementById("resultTeamListRight");
const surveyResultsView = document.getElementById("surveyResultsView");
const rankingView = document.getElementById("rankingView");
const resultsView = document.getElementById("resultsView");
const resultsSection = document.getElementById("resultsSection");
const podium = document.getElementById("podium");
const resultTitle = document.getElementById("resultTitle");
const surveyImage = document.getElementById("surveyImage");
let revealCorrectTextTimer = null;
const finishedThanks = document.getElementById("finishedThanks");

// チーム識別色（メーター上のドット・左右凡例で共通）
const TEAM_COLORS = [
  "#f97316",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#84cc16",
  "#f43f5e"
];

function getTeamColor(index) {
  return TEAM_COLORS[index % TEAM_COLORS.length];
}

const OPTION_BADGE_SRC = {
  A: "/data/image/components/square-a.png",
  B: "/data/image/components/square-b.png",
  C: "/data/image/components/square-c.png",
  D: "/data/image/components/square-d.png"
};

const QUESTION4_OPTION_IMAGE_FALLBACK = {
  A: "/data/image/components/c10",
  B: "/data/image/components/r34.jpg",
  C: "/data/image/components/v37.jpg"
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function optionBadgeHtml(key) {
  const normalized = String(key || "").toUpperCase();
  const src = OPTION_BADGE_SRC[normalized];
  if (!src) {
    return escapeHtml(normalized);
  }
  return `<img class="option-badge" src="${src}" alt="${escapeHtml(normalized)}" />`;
}

function formatQuestionHtml(questionText) {
  const escaped = escapeHtml(questionText || "");
  return escaped.replace(/\{\{([A-Da-d])\}\}/g, (_, key) => optionBadgeHtml(key));
}

function renderSurveyCard(question) {
  const options = question && Array.isArray(question.surveyOptions)
    ? question.surveyOptions
    : [];
  const hasSurvey =
    question &&
    question.surveyQuestion &&
    options.length > 0;

  if (!hasSurvey) {
    surveyCard.hidden = true;
    surveyQuestionText.textContent = "";
    surveyOptionsList.innerHTML = "";
    surveyOptionsList.classList.remove("is-cols-2");
    surveyOptionsList.classList.remove("is-photo-mode");
    return;
  }

  surveyCard.hidden = false;
  surveyQuestionText.textContent = question.surveyQuestion;
  const isQuestion4 = Number(question.id) === 4;
  surveyOptionsList.classList.toggle("is-photo-mode", isQuestion4);
  surveyOptionsList.classList.toggle("is-cols-2", !isQuestion4 && options.length >= 3);
  const focusKeys = new Set(
    (Array.isArray(question.focusOptions)
      ? question.focusOptions
      : [question.focusOption]
    )
      .map((key) => String(key || "").toUpperCase().trim())
      .filter((key) => key.length > 0)
  );
  surveyOptionsList.innerHTML = options
    .map((option) => {
      const key = String(option.key || "").toUpperCase();
      const isFocus = focusKeys.has(key);
      const optionImage =
        (option && option.image) ||
        (isQuestion4 ? QUESTION4_OPTION_IMAGE_FALLBACK[key] : null);
      return `
        <li class="survey-option${isFocus ? " is-focus" : ""}${optionImage ? " has-option-image" : ""}">
          ${optionBadgeHtml(key)}
          ${optionImage
            ? `<img class="survey-option-image" src="${escapeHtml(optionImage)}" alt="${escapeHtml(option.label || key)}" onerror="this.style.display='none'; this.closest('li')?.classList.remove('has-option-image');" />`
            : ""
          }
          <span class="survey-option-label">${escapeHtml(option.label || "")}</span>
        </li>
      `;
    })
    .join("");

  if (!isQuestion4) {
    // CSSの競合やキャッシュ差分があっても、選択肢は常に縦中央にそろえる
    surveyOptionsList.querySelectorAll(".survey-option").forEach((item) => {
      item.style.alignItems = "center";

      const badge = item.querySelector(".option-badge");
      if (badge) {
        badge.style.alignSelf = "center";
        badge.style.marginTop = "0";
      }

      const label = item.querySelector(".survey-option-label");
      if (label) {
        label.style.alignSelf = "center";
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.minHeight = "clamp(40px, 4.5vw, 56px)";
      }
    });

    // 長い選択肢は最大2行に収まるようフォントを縮小（それでも足りなければ折り返して全文表示）
    requestAnimationFrame(fitSurveyOptionLabels);
  }
}

function fitSurveyOptionLabels() {
  const labels = surveyOptionsList.querySelectorAll(".survey-option-label");
  if (labels.length === 0) {
    return;
  }

  const isCols2 = surveyOptionsList.classList.contains("is-cols-2");
  const maxPx = isCols2 ? 26 : 32;
  const minPx = isCols2 ? 15 : 17;
  const maxLines = 2;

  labels.forEach((label) => {
    label.style.fontSize = "";
    let size = maxPx;
    label.style.fontSize = `${size}px`;

    const lineHeightPx = () => {
      const computed = parseFloat(getComputedStyle(label).lineHeight);
      if (Number.isFinite(computed) && computed > 0) {
        return computed;
      }
      return size * 1.35;
    };

    while (size > minPx && label.scrollHeight > lineHeightPx() * maxLines + 1) {
      size -= 1;
      label.style.fontSize = `${size}px`;
    }
  });
}

function buildQuestionRenderKey(state) {
  if (!state || !state.currentQuestion) {
    return `${state && state.status ? state.status : "none"}:none`;
  }
  const question = state.currentQuestion;
  return [
    state.status || "",
    state.currentQuestionId || "",
    question.questionText || "",
    question.surveyQuestion || "",
    Array.isArray(question.surveyOptions) ? question.surveyOptions.length : 0
  ].join("|");
}

let lastQuestionRenderKey = "";

// 結果発表の公開段階（管理者が操作）
let lastResultsRevealStep = -1;

// 参加チーム一覧をカード内に収める（スクロールなし）
// 22px 時にちょうどよい余白になるセル高さ上限＋上詰め
const TEAM_MAX_FONT_PX = 22;
const TEAM_MAX_CELL_H = 72;

function fitTeamListToCard() {
  const items = teamList.children;
  const count = items.length;
  if (count === 0 || waitingSection.style.display === "none") {
    return;
  }

  const width = teamList.clientWidth;
  const height = teamList.clientHeight;
  if (width <= 0 || height <= 0) {
    return;
  }

  let best = null;
  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const gap = Math.max(4, Math.min(12, Math.floor(Math.min(width, height) / 40)));
    const cellW = (width - gap * (cols - 1)) / cols;
    const cellH = Math.min(TEAM_MAX_CELL_H, (height - gap * (rows - 1)) / rows);
    if (cellW < 64 || cellH < 24) {
      continue;
    }
    // 読みやすさ優先：セル面積と短い辺のバランスで評価
    const score = Math.min(cellW, cellH * 2.2) * Math.min(cellW, cellH);
    if (!best || score > best.score) {
      best = { cols, rows, gap, cellW, cellH, score };
    }
  }

  if (!best) {
    best = {
      cols: Math.max(1, count),
      rows: 1,
      gap: 4,
      cellW: width / Math.max(1, count),
      cellH: Math.min(TEAM_MAX_CELL_H, height),
      score: 0
    };
  }

  const fontPx = Math.max(
    10,
    Math.min(TEAM_MAX_FONT_PX, best.cellH * 0.38, best.cellW * 0.14)
  );
  const padY = Math.max(2, Math.min(16, best.cellH * 0.16));
  const padX = Math.max(6, Math.min(20, best.cellW * 0.08));
  const radius = Math.max(6, Math.min(12, Math.min(best.cellH, best.cellW) * 0.12));

  teamList.style.gridTemplateColumns = `repeat(${best.cols}, minmax(0, 1fr))`;
  teamList.style.gridTemplateRows = `repeat(${best.rows}, minmax(0, ${TEAM_MAX_CELL_H}px))`;
  teamList.style.justifyContent = "stretch";
  teamList.style.alignContent = "start";
  teamList.style.setProperty("--team-gap", `${best.gap}px`);
  teamList.style.setProperty("--team-font", `${fontPx}px`);
  teamList.style.setProperty("--team-pad-y", `${padY}px`);
  teamList.style.setProperty("--team-pad-x", `${padX}px`);
  teamList.style.setProperty("--team-radius", `${radius}px`);
}

function scheduleFitTeamList() {
  requestAnimationFrame(() => {
    requestAnimationFrame(fitTeamListToCard);
  });
}

window.addEventListener("resize", () => {
  if (document.body.classList.contains("waiting-background")) {
    scheduleFitTeamList();
  }
  if (resultView.style.display !== "none") {
    scheduleFitResultTeamLegends();
  }
  if (document.body.classList.contains("ranking-revealed-active")) {
    scheduleFitRankingList();
  }
  if (document.body.classList.contains("results-announced-active")) {
    scheduleFitPodiumNames();
  }
  if (!surveyCard.hidden) {
    fitSurveyOptionLabels();
  }
});

// 残り時間を mm:ss 形式の文字列にする
function formatRemainingTime(seconds) {
  if (typeof seconds !== "number") {
    return "--:--";
  }
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

socket.on("connect", () => {
  statusEl.textContent = "スクリーン画面が接続されました";
});

// 状態更新受信
socket.on("stateUpdated", (state) => {
  // 参加チーム一覧
  teamList.innerHTML = "";
  state.teams.forEach((team) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = team.name;
    li.appendChild(name);
    teamList.appendChild(li);
  });

  const showWaiting = state.status === "waiting";
  const showQuestionView =
    state.status === "question" ||
    state.status === "answer_closed" ||
    state.status === "started";
  const showResultView =
    state.status === "answers_revealed" || state.status === "correct_revealed";
  const showSurveyResultsView = state.status === "survey_results";
  const showRankingView = state.status === "ranking_revealed";
  const showResultsView = state.status === "results_announced";
  const showFinishedView = state.status === "finished";

  waitingSection.style.display = showWaiting ? "flex" : "none";
  questionView.style.display = showQuestionView ? "flex" : "none";
  resultView.style.display = showResultView ? "flex" : "none";
  surveyResultsView.style.display = showSurveyResultsView ? "block" : "none";
  rankingView.style.display = showRankingView ? "flex" : "none";
  resultsSection.style.display = showResultsView ? "flex" : "none";
  finishedThanks.style.display = showFinishedView ? "block" : "none";
  // 出題中・回答公開/正解発表・結果発表・終了は専用表示のため、上部statusは隠す
  statusEl.style.display =
    showQuestionView || showResultView || showResultsView || showFinishedView
      ? "none"
      : "";

  // 参加受付中は待機背景、出題〜結果発表はサイド背景（下端合わせ）
  const useEventBackground =
    state.status === "started" ||
    state.status === "question" ||
    state.status === "answer_closed" ||
    state.status === "answers_revealed" ||
    state.status === "correct_revealed" ||
    state.status === "survey_results" ||
    state.status === "ranking_revealed" ||
    state.status === "results_announced";
  document.body.classList.toggle("waiting-background", showWaiting);
  document.body.classList.toggle("event-background", useEventBackground);
  document.body.classList.toggle("finished-background", showFinishedView);
  document.body.classList.toggle("result-reveal-active", showResultView);
  document.body.classList.toggle("ranking-revealed-active", showRankingView);

  if (showWaiting) {
    scheduleFitTeamList();
  }
  if (showRankingView) {
    scheduleFitRankingList();
  }

  if (state.surveyImageUrl) {
    surveyImage.src = state.surveyImageUrl;
  }

  if (state.status === "waiting") {
    statusEl.textContent = "参加受付中";
    currentQuestionText.textContent = "出題を待っています";
    renderSurveyCard(null);
    questionTitle.textContent = "出題待ち";
    timerValue.textContent = "--:--";
    correctAnswerText.textContent = "正解: --";
    correctAnswerText.hidden = true;
    gaugeContainer.innerHTML = "";
    resultTeamListLeft.innerHTML = "";
    resultTeamListRight.innerHTML = "";
  } else if (state.status === "question" || state.status === "answer_closed") {
    questionTitle.textContent = state.isPractice
      ? "例題"
      : `第${(state.currentQuestionIndex ?? -1) + 1}問`;
    statusEl.textContent = questionTitle.textContent;
  } else if (state.status === "answers_revealed") {
    statusEl.textContent = "回答公開";
  } else if (state.status === "correct_revealed") {
    statusEl.textContent = "正解発表";
  } else if (state.status === "survey_results") {
    statusEl.textContent = "アンケート結果";
  } else if (state.status === "ranking_revealed") {
    statusEl.textContent = "ランキング";
  } else if (state.status === "results_announced") {
    statusEl.textContent = "結果発表";
  } else if (state.status === "finished") {
    statusEl.textContent = "イベント終了";
  } else if (state.status === "started") {
    statusEl.textContent = "イベント進行中";
    questionTitle.textContent = "出題待ち";
  } else {
    statusEl.textContent = "イベント進行中";
  }

  if (
    state.status !== "waiting" &&
    state.status !== "finished" &&
    state.status !== "results_announced"
  ) {
    const nextQuestionRenderKey = buildQuestionRenderKey(state);
    if (nextQuestionRenderKey !== lastQuestionRenderKey) {
      if (state.currentQuestion) {
        renderSurveyCard(state.currentQuestion);
        currentQuestionText.innerHTML = formatQuestionHtml(
          state.currentQuestion.questionText
        );
      } else {
        renderSurveyCard(null);
        currentQuestionText.textContent = "出題を待っています";
      }
      lastQuestionRenderKey = nextQuestionRenderKey;
    }

    timerValue.textContent = formatRemainingTime(state.remainingTime);
  } else {
    lastQuestionRenderKey = "";
  }

  if (state.status === "answers_revealed") {
    resultTitle.textContent = "回答公開";
  } else if (state.status === "correct_revealed") {
    resultTitle.textContent = "正解発表";
  }

  if (showResultView) {
    renderGauge(state);
    scheduleFitResultTeamLegends();
  }

  // 途中の順位発表
  renderRanking(rankingList, state, state.status === "ranking_revealed");
  // 結果発表（1〜3位）
  renderPodium(state, showResultsView);
});

function renderRanking(listEl, state, shouldShow) {
  listEl.innerHTML = "";

  if (!shouldShow) {
    return;
  }

  const isScreenRanking = listEl === rankingList;

  state.ranking.forEach((team, index) => {
    const place = index + 1;
    const li = document.createElement("li");
    if (isScreenRanking) {
      if (place <= 3) {
        li.className = `ranking-item ranking-item--${place}`;
      } else {
        li.className = "ranking-item ranking-item--rest";
      }

      const rank = document.createElement("span");
      rank.className = "ranking-item-rank";
      rank.textContent = `${place}位`;

      const name = document.createElement("span");
      name.className = "ranking-item-name";
      name.textContent = team.name;

      const score = document.createElement("span");
      score.className = "ranking-item-score";
      score.textContent = `${team.score} pt`;

      li.appendChild(rank);
      li.appendChild(name);
      li.appendChild(score);
    } else {
      li.textContent = `${place}位 ${team.name} - ${team.score}点`;
    }
    listEl.appendChild(li);
  });

  if (isScreenRanking) {
    scheduleFitRankingList();
  }
}

const RANKING_REST_MAX_H = 56;
const RANKING_REST_MIN_H = 36;
const RANKING_REST_MAX_FONT = 32;
const RANKING_REST_MIN_FONT = 14;
const RANKING_GAP_MAX = 12;
const RANKING_GAP_MIN = 6;

function scheduleFitRankingList() {
  requestAnimationFrame(() => {
    requestAnimationFrame(fitRankingList);
  });
}

function rankingListOverflows() {
  return rankingList.scrollHeight > rankingList.clientHeight + 1;
}

function fitRankingList() {
  if (!rankingList || rankingView.style.display === "none") {
    return;
  }

  const restItems = rankingList.querySelectorAll(".ranking-item--rest");
  rankingList.classList.remove("is-two-col");
  rankingList.style.removeProperty("--ranking-gap");
  rankingList.style.removeProperty("--ranking-rest-h");
  rankingList.style.removeProperty("--ranking-rest-pad-y");
  rankingList.style.removeProperty("--ranking-rest-font");

  if (restItems.length === 0) {
    return;
  }

  // 1列で入りきらなければ 4位以降を2列に
  if (rankingListOverflows()) {
    rankingList.classList.add("is-two-col");
  }

  // それでも足りなければ 4位以降の高さ・余白・フォントを縮小
  if (!rankingListOverflows()) {
    return;
  }

  let gap = RANKING_GAP_MAX;
  let height = RANKING_REST_MAX_H;
  let fontPx = RANKING_REST_MAX_FONT;

  for (let step = 0; step < 40; step += 1) {
    const padY = Math.max(4, Math.floor(height * 0.22));
    rankingList.style.setProperty("--ranking-gap", `${gap}px`);
    rankingList.style.setProperty("--ranking-rest-h", `${height}px`);
    rankingList.style.setProperty("--ranking-rest-pad-y", `${padY}px`);
    rankingList.style.setProperty("--ranking-rest-font", `${fontPx}px`);

    if (!rankingListOverflows()) {
      break;
    }

    if (height > RANKING_REST_MIN_H) {
      height -= 2;
    } else if (gap > RANKING_GAP_MIN) {
      gap -= 1;
    } else if (fontPx > RANKING_REST_MIN_FONT) {
      fontPx -= 1;
    } else {
      break;
    }
  }
}

function renderPodium(state, shouldShow) {
  if (!shouldShow) {
    podium.innerHTML = "";
    lastResultsRevealStep = -1;
    return;
  }

  const topTeams = (state.ranking || []).slice(0, 3);
  const step = state.resultsRevealStep || 0;
  const revealOrder = [3, 2, 1].filter((place) => place <= topTeams.length);
  const revealedPlaces = new Set(revealOrder.slice(0, step));
  const previouslyRevealed = new Set(
    revealOrder.slice(0, Math.max(0, lastResultsRevealStep))
  );
  lastResultsRevealStep = step;

  podium.innerHTML = "";

  if (topTeams.length === 0) {
    const empty = document.createElement("p");
    empty.className = "podium-empty";
    empty.textContent = "表示できるチームがありません";
    podium.appendChild(empty);
    return;
  }

  if (step === 0) {
    const waiting = document.createElement("p");
    waiting.className = "podium-empty";
    waiting.textContent = "上位表彰の発表をお待ちください";
    podium.appendChild(waiting);
    return;
  }

  const displayOrder = [1, 0, 2].filter((index) => index < topTeams.length);

  displayOrder.forEach((rankIndex) => {
    const team = topTeams[rankIndex];
    const place = rankIndex + 1;
    const item = document.createElement("div");
    item.className = `podium-place podium-place--${place}`;

    const crownHtml =
      place === 1
        ? `<span class="podium-crown" aria-hidden="true">👑</span>`
        : "";

    if (!revealedPlaces.has(place)) {
      item.classList.add("podium-place--hidden");
      item.innerHTML = `
        ${crownHtml}
        <p class="podium-name">？</p>
        <p class="podium-score">--</p>
        <div class="podium-block">
          <div class="podium-face podium-face--top" aria-hidden="true"></div>
          <div class="podium-face podium-face--front">
            <span class="podium-rank">${place}位</span>
          </div>
          <div class="podium-face podium-face--side" aria-hidden="true"></div>
        </div>
      `;
      podium.appendChild(item);
      return;
    }

    item.innerHTML = `
      ${crownHtml}
      <p class="podium-name"></p>
      <p class="podium-score"></p>
      <div class="podium-block">
        <div class="podium-face podium-face--top" aria-hidden="true"></div>
        <div class="podium-face podium-face--front">
          <span class="podium-rank">${place}位</span>
        </div>
        <div class="podium-face podium-face--side" aria-hidden="true"></div>
      </div>
    `;
    item.querySelector(".podium-name").textContent = team.name;
    item.querySelector(".podium-score").textContent = `${team.score} pt`;

    if (previouslyRevealed.has(place)) {
      item.classList.add("is-visible");
    }

    podium.appendChild(item);
  });

  requestAnimationFrame(() => {
    podium.querySelectorAll(".podium-place:not(.podium-place--hidden)").forEach((el) => {
      if (!el.classList.contains("is-visible")) {
        el.classList.add("is-visible");
      }
    });
    fitPodiumNames();
  });
}

const PODIUM_NAME_MAX_FONT_PX = 54;
const PODIUM_NAME_MIN_FONT_PX = 14;

function scheduleFitPodiumNames() {
  requestAnimationFrame(() => {
    requestAnimationFrame(fitPodiumNames);
  });
}

function fitPodiumNames() {
  if (!podium || resultsSection.style.display === "none") {
    return;
  }

  const names = podium.querySelectorAll(".podium-name");
  names.forEach((nameEl) => {
    nameEl.style.fontSize = "";
    const computed = parseFloat(getComputedStyle(nameEl).fontSize);
    let size = Number.isFinite(computed)
      ? Math.min(PODIUM_NAME_MAX_FONT_PX, computed)
      : PODIUM_NAME_MAX_FONT_PX;
    nameEl.style.fontSize = `${size}px`;

    while (size > PODIUM_NAME_MIN_FONT_PX && nameEl.scrollWidth > nameEl.clientWidth + 1) {
      size -= 1;
      nameEl.style.fontSize = `${size}px`;
    }
  });
}

function clampAnswer(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

const RESULT_LEGEND_MAX_FONT_PX = 28;
const RESULT_LEGEND_MAX_ITEM_H = 64;
const RESULT_LEGEND_MIN_FONT_PX = 12;
const RESULT_LEGEND_MIN_ITEM_H = 28;

function scheduleFitResultTeamLegends() {
  requestAnimationFrame(() => {
    requestAnimationFrame(fitResultTeamLegends);
  });
}

function fitResultTeamLegends() {
  if (resultView.style.display === "none") {
    return;
  }

  const lists = [resultTeamListLeft, resultTeamListRight].filter(Boolean);
  const items = lists.flatMap((list) => Array.from(list.children));
  if (items.length === 0) {
    return;
  }

  const body = resultView.querySelector(".result-reveal-body");
  if (!body) {
    return;
  }

  const availableHeight = Math.max(
    0,
    Math.min(...lists.map((list) => list.clientHeight).filter((h) => h > 0))
  );
  if (availableHeight <= 0) {
    return;
  }

  const maxCount = Math.max(
    resultTeamListLeft.children.length,
    resultTeamListRight.children.length,
    1
  );
  const gap = Math.max(
    4,
    Math.min(14, Math.floor(availableHeight / Math.max(12, maxCount * 3)))
  );
  const itemH = Math.max(
    RESULT_LEGEND_MIN_ITEM_H,
    Math.min(
      RESULT_LEGEND_MAX_ITEM_H,
      Math.floor((availableHeight - gap * Math.max(0, maxCount - 1)) / maxCount)
    )
  );
  const fontPx = Math.max(
    RESULT_LEGEND_MIN_FONT_PX,
    Math.min(RESULT_LEGEND_MAX_FONT_PX, Math.floor(itemH * 0.42))
  );
  const swatch = Math.max(10, Math.min(22, Math.floor(itemH * 0.36)));
  const padY = Math.max(2, Math.min(12, Math.floor(itemH * 0.12)));
  const padX = Math.max(6, Math.min(14, Math.floor(itemH * 0.2)));
  const radius = Math.max(6, Math.min(12, Math.floor(itemH * 0.18)));

  resultView.style.setProperty("--result-legend-gap", `${gap}px`);
  resultView.style.setProperty("--result-legend-font", `${fontPx}px`);
  resultView.style.setProperty("--result-legend-item-h", `${itemH}px`);
  resultView.style.setProperty("--result-legend-swatch", `${swatch}px`);
  resultView.style.setProperty("--result-legend-pad-y", `${padY}px`);
  resultView.style.setProperty("--result-legend-pad-x", `${padX}px`);
  resultView.style.setProperty("--result-legend-radius", `${radius}px`);
}

function renderTeamLegend(listEl, teams, options = {}) {
  const showCorrect = Boolean(options.showCorrect);
  const correctValue =
    options.correctValue !== null && options.correctValue !== undefined
      ? clampAnswer(options.correctValue)
      : null;

  listEl.innerHTML = "";
  teams.forEach((team) => {
    const li = document.createElement("li");
    li.className = "result-team-legend-item";
    const hasAnswer = team.answer !== null && team.answer !== undefined;

    if (!hasAnswer) {
      li.classList.add("is-unanswered");
    }
    if (showCorrect && hasAnswer && correctValue !== null && team.answer === correctValue) {
      li.classList.add("is-correct");
    }

    const swatch = document.createElement("span");
    swatch.className = "result-team-swatch";
    swatch.style.background = team.color;
    swatch.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "result-team-name";
    name.textContent = team.teamName || "";
    if ((team.teamName || "").length >= 13) {
      name.classList.add("is-long");
    }

    const answer = document.createElement("span");
    answer.className = "result-team-answer";
    answer.textContent = hasAnswer ? `${team.answer}%` : "--%";

    li.appendChild(swatch);
    li.appendChild(name);
    li.appendChild(answer);
    if (li.classList.contains("is-correct")) {
      const perfect = document.createElement("span");
      perfect.className = "result-team-perfect-badge";
      perfect.textContent = "ピタリ";
      li.appendChild(perfect);
    }
    listEl.appendChild(li);
  });
}

function renderGauge(state) {
  if (revealCorrectTextTimer) {
    clearTimeout(revealCorrectTextTimer);
    revealCorrectTextTimer = null;
  }

  gaugeContainer.innerHTML = "";
  resultTeamListLeft.innerHTML = "";
  resultTeamListRight.innerHTML = "";

  const revealedAnswers = Array.isArray(state.revealedAnswers)
    ? state.revealedAnswers
    : [];

  if (revealedAnswers.length === 0) {
    correctAnswerText.hidden = true;
    return;
  }

  const showCorrect = state.status === "correct_revealed";
  const correctValue =
    state.correctAnswer !== null && state.correctAnswer !== undefined
      ? clampAnswer(state.correctAnswer)
      : null;

  const teams = revealedAnswers.map((item, index) => ({
    teamName: item.teamName,
    answer:
      item.answer !== null && item.answer !== undefined
        ? clampAnswer(item.answer)
        : null,
    color: getTeamColor(index)
  }));

  const mid = Math.ceil(teams.length / 2);
  const renderLegends = (enableCorrectHighlight) => {
    renderTeamLegend(resultTeamListLeft, teams.slice(0, mid), {
      showCorrect: enableCorrectHighlight,
      correctValue
    });
    renderTeamLegend(resultTeamListRight, teams.slice(mid), {
      showCorrect: enableCorrectHighlight,
      correctValue
    });
  };

  // 正解発表時は、正解%の表示タイミングまではピタリ強調を出さない
  renderLegends(!showCorrect);

  const teamMarkers = teams
    .filter((team) => team.answer !== null)
    .map((team) => ({
      percent: team.answer,
      color: team.color
    }));

  const tacho = renderTachometer({
    teamMarkers,
    correctValue: showCorrect ? correctValue : null,
    showCorrect
  });
  gaugeContainer.appendChild(tacho.root);

  if (state.isPractice) {
    correctAnswerText.textContent = "例題（正解発表なし）";
    correctAnswerText.hidden = false;
  } else if (showCorrect && correctValue !== null) {
    correctAnswerText.textContent = "正解: --";
    correctAnswerText.hidden = true;
    revealCorrectTextTimer = setTimeout(() => {
      renderLegends(true);
      correctAnswerText.textContent = `正解: ${correctValue}%`;
      correctAnswerText.hidden = false;
      revealCorrectTextTimer = null;
    }, getCorrectNeedleRevealDuration(correctValue));
  } else {
    correctAnswerText.textContent = "正解: --";
    correctAnswerText.hidden = true;
  }
}

const TACHO = {
  cx: 150,
  cy: 150,
  // 半径は画像幅(300)の半分
  radius: 150,
  needleLen: 138
};

const TACHO_FACE_SRC = "/data/image/components/meter-black.png";
const TACHO_START_DEG = 240;
const TACHO_END_DEG = 0;

function percentToRad(percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent)));
  const deg =
    TACHO_START_DEG +
    (TACHO_END_DEG - TACHO_START_DEG) * (clamped / 100);
  return (deg * Math.PI) / 180;
}

function tachoPoint(percent, radius = TACHO.radius) {
  const rad = percentToRad(percent);
  return {
    x: TACHO.cx + radius * Math.cos(rad),
    y: TACHO.cy - radius * Math.sin(rad)
  };
}

function valueToRotateDeg(value) {
  const clamped = Math.max(0, Math.min(100, Number(value)));
  const deg =
    TACHO_START_DEG +
    (TACHO_END_DEG - TACHO_START_DEG) * (clamped / 100);
  // 針の初期向きは「上」なので、右0°・反時計回り基準の角度を
  // CSS回転角（時計回り正）へ変換する。
  return 90 - deg;
}

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, val]) => {
    el.setAttribute(key, String(val));
  });
  return el;
}

function renderTachometer({ teamMarkers, correctValue, showCorrect }) {
  const root = document.createElement("div");
  root.className = "tacho-gauge";

  const face = document.createElement("img");
  face.className = "tacho-face";
  face.src = TACHO_FACE_SRC;
  face.alt = "回答タコメーター";

  const svg = createSvgEl("svg", {
    viewBox: "0 0 300 300",
    class: "tacho-overlay",
    role: "presentation",
    "aria-hidden": "true"
  });

  teamMarkers.forEach((marker) => {
    const point = tachoPoint(marker.percent, TACHO.radius);
    const rad = percentToRad(marker.percent);
    // 円周上の法線方向（中心->点）に短い棒を置く
    const nx = Math.cos(rad);
    const ny = -Math.sin(rad);
    const inset = 4;
    const halfLen = 11;
    const cx = point.x - nx * inset;
    const cy = point.y - ny * inset;
    const angleDeg = (Math.atan2(ny, nx) * 180) / Math.PI;
    const outerH = 7.2;
    const innerH = 5.6;
    const width = halfLen * 2;

    svg.appendChild(
      createSvgEl("rect", {
        x: cx - width / 2,
        y: cy - outerH / 2,
        width,
        height: outerH,
        rx: 2.2,
        ry: 2.2,
        class: "tacho-team-marker-outline",
        transform: `rotate(${angleDeg} ${cx} ${cy})`
      })
    );

    const bar = createSvgEl("rect", {
      x: cx - width / 2,
      y: cy - innerH / 2,
      width,
      height: innerH,
      rx: 1.6,
      ry: 1.6,
      class: "tacho-team-marker",
      transform: `rotate(${angleDeg} ${cx} ${cy})`
    });
    if (marker.color) {
      bar.style.fill = marker.color;
    }
    svg.appendChild(bar);
  });

  if (showCorrect && correctValue !== null) {
    svg.appendChild(
      createNeedleGroup("tacho-needle tacho-needle-correct", correctValue)
    );
  }

  svg.appendChild(
    createSvgEl("circle", {
      cx: TACHO.cx,
      cy: TACHO.cy,
      r: 13,
      class: "tacho-hub"
    })
  );

  root.appendChild(face);
  root.appendChild(svg);

  requestAnimationFrame(() => {
    root.querySelectorAll(".tacho-needle").forEach((needle) => {
      const target = Number(needle.dataset.target);
      if (needle.classList.contains("tacho-needle-correct")) {
        animateCorrectNeedle(needle, target);
        return;
      }
      needle.style.transform = `rotate(${valueToRotateDeg(target)}deg)`;
    });
  });

  return { root };
}

function animateCorrectNeedle(needle, targetValue) {
  const target = clampAnswer(targetValue);
  const pivotValue = 85;
  const pivotDeg = valueToRotateDeg(pivotValue);
  const targetDeg = valueToRotateDeg(target);

  needle.style.transform = `rotate(${valueToRotateDeg(0)}deg)`;

  // 正解が85%以下: 85%まで進んでから正解値へ戻る
  if (target <= pivotValue) {
    needle.style.transition = "transform 1200ms cubic-bezier(0.52, 0.02, 0.32, 1)";
    needle.style.transform = `rotate(${pivotDeg}deg)`;

    setTimeout(() => {
      needle.style.transition = "transform 620ms cubic-bezier(0.33, 0, 0.67, 1)";
      needle.style.transform = `rotate(${targetDeg}deg)`;
    }, 1220);
    return;
  }

  // 正解が85%以上: 85%付近で一度ゆっくりになってから正解値へ向かう
  needle.style.transition = "transform 1350ms cubic-bezier(0.52, 0.02, 0.32, 1)";
  needle.style.transform = `rotate(${pivotDeg}deg)`;

  setTimeout(() => {
    needle.style.transition = "transform 760ms cubic-bezier(0.18, 0, 0.2, 1)";
    needle.style.transform = `rotate(${targetDeg}deg)`;
  }, 1370);
}

function getCorrectNeedleRevealDuration(targetValue) {
  const target = clampAnswer(targetValue);
  const bufferMs = 420;
  if (target <= 85) {
    return 1220 + 620 + bufferMs;
  }
  return 1370 + 760 + bufferMs;
}

function createNeedleGroup(className, value) {
  const group = createSvgEl("g", {
    class: `${className} tacho-needle`
  });
  group.dataset.target = String(value);

  const baseY = TACHO.cy + 7;
  const tipY = TACHO.cy - TACHO.needleLen;
  const points = [
    `${TACHO.cx - 6},${baseY}`,
    `${TACHO.cx + 6},${baseY}`,
    `${TACHO.cx + 1.2},${tipY + 10}`,
    `${TACHO.cx},${tipY}`,
    `${TACHO.cx - 1.2},${tipY + 10}`
  ].join(" ");

  group.appendChild(
    createSvgEl("polygon", {
      points,
      class: "tacho-needle-body"
    })
  );

  // 針の反対側に少しはみ出す重り
  group.appendChild(
    createSvgEl("circle", {
      cx: TACHO.cx,
      cy: TACHO.cy + 13,
      r: 5,
      class: "tacho-needle-counterweight"
    })
  );

  return group;
}
