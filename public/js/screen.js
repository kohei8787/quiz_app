// サーバーへ接続
const socket = io();

// 画面要素を取得
const statusEl = document.getElementById("status");
const teamList = document.getElementById("teamList");
const currentQuestionText = document.getElementById("currentQuestionText");
const timerText = document.getElementById("timerText");
const correctAnswerText = document.getElementById("correctAnswerText");
const gaugeContainer = document.getElementById("gaugeContainer");
const rankingList = document.getElementById("rankingList");
const rankingTitle = document.getElementById("rankingTitle");
const waitingSection = document.getElementById("waitingSection");
const questionView = document.getElementById("questionView");
const surveyCard = document.getElementById("surveyCard");
const surveyQuestionText = document.getElementById("surveyQuestionText");
const surveyOptionsList = document.getElementById("surveyOptionsList");
const resultView = document.getElementById("resultView");
const surveyResultsView = document.getElementById("surveyResultsView");
const rankingView = document.getElementById("rankingView");
const finishedView = document.getElementById("finishedView");
const finishedRankingList = document.getElementById("finishedRankingList");
const resultsView = document.getElementById("resultsView");
const podium = document.getElementById("podium");
const resultTitle = document.getElementById("resultTitle");
const surveyImage = document.getElementById("surveyImage");

const OPTION_BADGE_SRC = {
  A: "/data/image/components/square-a.png",
  B: "/data/image/components/square-b.png",
  C: "/data/image/components/square-c.png",
  D: "/data/image/components/square-d.png"
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
    return;
  }

  surveyCard.hidden = false;
  surveyQuestionText.textContent = question.surveyQuestion;
  surveyOptionsList.classList.toggle("is-cols-2", options.length >= 3);
  const focusKey = String(question.focusOption || "").toUpperCase();
  surveyOptionsList.innerHTML = options
    .map((option) => {
      const key = String(option.key || "").toUpperCase();
      const isFocus = focusKey && key === focusKey;
      return `
        <li class="survey-option${isFocus ? " is-focus" : ""}">
          ${optionBadgeHtml(key)}
          <span class="survey-option-label">${escapeHtml(option.label || "")}</span>
        </li>
      `;
    })
    .join("");

  // 長い選択肢は最大2行に収まるようフォントを縮小（それでも足りなければ折り返して全文表示）
  requestAnimationFrame(fitSurveyOptionLabels);
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
  if (!surveyCard.hidden) {
    fitSurveyOptionLabels();
  }
});

// 残り時間を mm:ss 形式の文字列にする
function formatRemainingTime(seconds) {
  if (typeof seconds !== "number") {
    return "残り時間: --:--";
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return `残り時間: ${mm}:${ss}`;
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
  // イベント終了：参加受付ではなくお礼画面を表示
  const showFinishedView = state.status === "finished";

  waitingSection.style.display = showWaiting ? "flex" : "none";
  questionView.style.display = showQuestionView ? "flex" : "none";
  resultView.style.display = showResultView ? "block" : "none";
  surveyResultsView.style.display = showSurveyResultsView ? "block" : "none";
  rankingView.style.display = showRankingView ? "block" : "none";
  resultsView.style.display = showResultsView ? "block" : "none";
  finishedView.style.display = showFinishedView ? "block" : "none";

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

  if (showWaiting) {
    scheduleFitTeamList();
  }

  if (state.surveyImageUrl) {
    surveyImage.src = state.surveyImageUrl;
  }

  if (state.status === "waiting") {
    statusEl.textContent = "参加受付中";
    currentQuestionText.textContent = "出題を待っています";
    renderSurveyCard(null);
    timerText.textContent = "残り時間: --:--";
    correctAnswerText.textContent = "正解: --";
    gaugeContainer.innerHTML = "";
  } else if (state.status === "question" || state.status === "answer_closed") {
    statusEl.textContent = state.isPractice
      ? "例題"
      : `第${(state.currentQuestionIndex ?? -1) + 1}問`;
  } else if (state.status === "answers_revealed") {
    statusEl.textContent = "回答公開";
  } else if (state.status === "correct_revealed") {
    statusEl.textContent = "正解発表";
  } else if (state.status === "survey_results") {
    statusEl.textContent = "アンケート結果公開";
  } else if (state.status === "ranking_revealed") {
    statusEl.textContent = "順位発表";
    rankingTitle.textContent = "順位発表";
  } else if (state.status === "results_announced") {
    statusEl.textContent = "結果発表";
  } else if (state.status === "finished") {
    statusEl.textContent = "イベント終了";
  } else {
    statusEl.textContent = "イベント進行中";
  }

  if (
    state.status !== "waiting" &&
    state.status !== "finished" &&
    state.status !== "results_announced"
  ) {
    if (state.currentQuestion) {
      renderSurveyCard(state.currentQuestion);
      currentQuestionText.innerHTML = formatQuestionHtml(
        state.currentQuestion.questionText
      );
    } else {
      renderSurveyCard(null);
      currentQuestionText.textContent = "出題を待っています";
    }

    timerText.textContent = formatRemainingTime(state.remainingTime);

    // 例題では正解を表示しない
    if (state.isPractice) {
      correctAnswerText.textContent = "例題（正解発表なし）";
    } else {
      correctAnswerText.textContent =
        state.correctAnswer !== null
          ? `正解: ${state.correctAnswer}%`
          : "正解: --";
    }
  }

  if (state.status === "answers_revealed") {
    resultTitle.textContent = "回答公開";
  } else if (state.status === "correct_revealed") {
    resultTitle.textContent = "正解発表";
  }

  if (showResultView) {
    renderGauge(state);
  }

  // 途中の順位発表
  renderRanking(rankingList, state, state.status === "ranking_revealed");
  // 結果発表（1〜3位）
  renderPodium(state, showResultsView);
  // 終了画面の最終順位
  renderRanking(finishedRankingList, state, state.status === "finished");
});

function renderRanking(listEl, state, shouldShow) {
  listEl.innerHTML = "";

  if (!shouldShow) {
    return;
  }

  state.ranking.forEach((team, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}位 ${team.name} - ${team.score}点`;
    listEl.appendChild(li);
  });
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
            <span class="podium-rank">${place}</span>
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
          <span class="podium-rank">${place}</span>
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
  });
}

function renderGauge(state) {
  gaugeContainer.innerHTML = "";

  if (!state.revealedAnswers || state.revealedAnswers.length === 0) {
    return;
  }

  const showCorrectPin = state.status === "correct_revealed";
  const showDetails = state.status === "answers_revealed";
  const correctValue = state.correctAnswer !== null ? state.correctAnswer : 0;

  const wrapper = document.createElement("div");
  wrapper.className = "gauge-track-wrapper";

  const track = document.createElement("div");
  track.className = "gauge-track";

  const fill = document.createElement("div");
  fill.className = "gauge-fill";
  fill.style.width = "100%";
  track.appendChild(fill);

  wrapper.appendChild(track);

  state.revealedAnswers.forEach((item) => {
    if (item.answer === null) {
      return;
    }

    const percent = Math.max(0, Math.min(100, item.answer));
    const pin = document.createElement("div");
    pin.className = "gauge-pin";
    pin.style.left = `${percent}%`;
    wrapper.appendChild(pin);

    if (showDetails) {
      const label = document.createElement("div");
      label.className = "gauge-label";
      label.textContent = item.teamName;
      label.style.left = `${percent}%`;
      wrapper.appendChild(label);

      const row = document.createElement("div");
      row.className = "result-team-row";
      row.innerHTML = `<span>${item.teamName}</span><span>${item.answer}%</span>`;
      gaugeContainer.appendChild(row);
    }
  });

  if (showCorrectPin) {
    const correctPin = document.createElement("div");
    correctPin.className = "gauge-pin correct";
    correctPin.style.left = "0%";

    const correctLabel = document.createElement("div");
    correctLabel.className = "gauge-label";
    correctLabel.textContent = `正解: ${correctValue}%`;
    correctLabel.style.left = `${correctValue}%`;

    wrapper.appendChild(correctPin);
    wrapper.appendChild(correctLabel);

    requestAnimationFrame(() => {
      correctPin.style.left = `${correctValue}%`;
    });
  }

  gaugeContainer.appendChild(wrapper);

  const scale = document.createElement("div");
  scale.className = "gauge-scale";
  scale.innerHTML = "<span>0%</span><span>50%</span><span>100%</span>";
  gaugeContainer.appendChild(scale);
}
