// サーバーへ接続
const socket = io();

// 画面要素を取得
const statusEl = document.getElementById("status");
const joinCodeInput = document.getElementById("joinCodeInput");
const teamNameInput = document.getElementById("teamNameInput");
const seatNumberInput = document.getElementById("seatNumberInput");
const joinButton = document.getElementById("joinButton");
const teamEditActions = document.getElementById("teamEditActions");
const confirmTeamButton = document.getElementById("confirmTeamButton");
const cancelTeamButton = document.getElementById("cancelTeamButton");
const joinMessage = document.getElementById("joinMessage");
const joinSectionTitle = document.getElementById("joinSectionTitle");
const surveyImage = document.getElementById("surveyImage");
const rankingTitle = document.getElementById("rankingTitle");
const currentQuestionText = document.getElementById("currentQuestionText");
const surveyInnerCard = document.getElementById("surveyInnerCard");
const surveyQuestionText = document.getElementById("surveyQuestionText");
const surveyOptionsList = document.getElementById("surveyOptionsList");
const questionProgress = document.getElementById("questionProgress");
const questionBadgeNum = document.getElementById("questionBadgeNum");
const questionHint = document.getElementById("questionHint");
const answerArea = document.getElementById("answerArea");
const answerInput = document.getElementById("answerInput");
const answerSlider = document.getElementById("answerSlider");
const answerDecButton = document.getElementById("answerDecButton");
const answerIncButton = document.getElementById("answerIncButton");
const submitAnswerButton = document.getElementById("submitAnswerButton");
const answerMessage = document.getElementById("answerMessage");
const joinSection = document.getElementById("joinSection");
const joinStack = document.getElementById("joinStack");
const joinWelcomeLogo = document.getElementById("joinWelcomeLogo");
const questionView = document.getElementById("questionView");
const myTeamResult = document.getElementById("myTeamResult");
const resultView = document.getElementById("resultView");
const surveyResultsView = document.getElementById("surveyResultsView");
const rankingView = document.getElementById("rankingView");
const rankingList = document.getElementById("rankingList");
const myRankText = document.getElementById("myRankText");
const questionReviewSection = document.getElementById("questionReviewSection");
const questionReviewList = document.getElementById("questionReviewList");
const resultsView = document.getElementById("resultsView");
const podium = document.getElementById("podium");
const timerValue = document.getElementById("timerValue");
const correctAnswerText = document.getElementById("correctAnswerText");
const scoreText = document.getElementById("scoreText");
const gaugeContainer = document.getElementById("gaugeContainer");
const resultTitle = document.getElementById("resultTitle");
const joinedSection = document.getElementById("joinedSection");
const joinedTeamNameDisplay = document.getElementById("joinedTeamNameDisplay");
const editTeamButtonAfterJoin = document.getElementById("editTeamButtonAfterJoin");
const waitingMessage = document.querySelector(".waiting-message");
const backgroundVideo = document.querySelector(".background-video-finished");

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
  const options =
    question && Array.isArray(question.surveyOptions)
      ? question.surveyOptions
      : [];
  const hasSurvey =
    question && question.surveyQuestion && options.length > 0;

  if (!hasSurvey) {
    surveyInnerCard.hidden = true;
    surveyQuestionText.textContent = "";
    surveyOptionsList.innerHTML = "";
    return;
  }

  surveyInnerCard.hidden = false;
  surveyQuestionText.textContent = question.surveyQuestion;
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
}

function renderQuestionContent(question, fallbackText) {
  if (question) {
    renderSurveyCard(question);
    currentQuestionText.innerHTML = formatQuestionHtml(question.questionText);
    return;
  }
  renderSurveyCard(null);
  currentQuestionText.textContent = fallbackText;
}
const editSection = document.getElementById("editSection");
const editSectionTitle = document.getElementById("editSectionTitle");
const editJoinCodeInput = document.getElementById("editJoinCodeInput");
const editTeamNameInput = document.getElementById("editTeamNameInput");
const editSeatNumberInput = document.getElementById("editSeatNumberInput");
const editActions = document.getElementById("editActions");
const editConfirmButton = document.getElementById("editConfirmButton");
const editCancelButton = document.getElementById("editCancelButton");
const editMessage = document.getElementById("editMessage");

// 問題切り替え判定用
let lastQuestionId = null;

// 結果発表アニメーションの再実行判定用（公開済み段階）
let lastResultsRevealStep = -1;

// 自チーム名を保持してスコア表示に使う
let myTeamName = "";

// 参加済みかどうか
let hasJoined = false;

// チーム情報の編集中かどうか（「チーム情報を変更」押下後）
let isEditingTeamInfo = false;

// キャンセル時に戻すための保存値
let savedTeamName = "";
let savedSeatNumber = "";

// 直近のイベント状態（参加受付中かどうかの判定用）
let currentEventStatus = "waiting";

// 残り時間を mm:ss 形式にする
function formatRemainingTime(seconds) {
  if (typeof seconds !== "number") {
    return "--:--";
  }
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
}

// 回答値を 0〜100 の整数に丸める
function clampAnswer(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 50;
  }
  return Math.max(0, Math.min(100, Math.round(num)));
}

function setAnswerValue(value) {
  const next = clampAnswer(value);
  answerInput.value = String(next);
  answerSlider.value = String(next);
}

function setAnswerControlsEnabled(enabled) {
  answerInput.disabled = !enabled;
  answerSlider.disabled = !enabled;
  answerDecButton.disabled = !enabled;
  answerIncButton.disabled = !enabled;
  submitAnswerButton.disabled = !enabled;
}

function updateQuestionMeta(state) {
  const total = state.questionCount || 0;

  if (state.isPractice) {
    questionBadgeNum.textContent = "例題";
    questionHint.textContent = "操作確認です。0〜100%の好きな値を選んでください";
    return;
  }

  const current =
    typeof state.currentQuestionIndex === "number" &&
    state.currentQuestionIndex >= 0
      ? state.currentQuestionIndex + 1
      : null;

  if (current !== null && total > 0) {
    questionBadgeNum.textContent = `第${current}問`;
  } else {
    questionBadgeNum.textContent = "第--問";
  }

  questionHint.textContent = "0~100%の範囲で予測してください";
}

// 再接続用にブラウザへ保存するキー
const JOIN_STORAGE_KEY = "quizJoinInfo";

function saveJoinInfo(teamName, seatNumber, code) {
  try {
    localStorage.setItem(
      JOIN_STORAGE_KEY,
      JSON.stringify({ teamName, seatNumber, joinCode: code })
    );
  } catch (e) {
    // localStorage が使えない環境では無視
  }
}

function loadJoinInfo() {
  try {
    const raw = localStorage.getItem(JOIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearJoinInfo() {
  try {
    localStorage.removeItem(JOIN_STORAGE_KEY);
  } catch (e) {
    // 無視
  }
}

// 保存済み情報で再接続を試みる
function tryAutoReconnect() {
  if (hasJoined) {
    return;
  }
  const saved = loadJoinInfo();
  if (!saved || !saved.teamName || !saved.seatNumber || !saved.joinCode) {
    return;
  }
  joinCodeInput.value = saved.joinCode;
  teamNameInput.value = saved.teamName;
  seatNumberInput.value = saved.seatNumber;
  socket.emit("joinTeam", {
    teamName: saved.teamName,
    seatNumber: saved.seatNumber,
    joinCode: saved.joinCode
  });
}

socket.on("connect", () => {
  statusEl.textContent = "参加者画面が接続されました";
  // 回線切断後の再接続で、同じチームに自動で戻る
  tryAutoReconnect();
});

// 参加フォームの表示を現在の状態に合わせて切り替える
function updateJoinFormMode() {
  const canEdit = currentEventStatus === "waiting";
  const joinClosed = currentEventStatus !== "waiting" && !hasJoined;

  if (!hasJoined) {
    // ===== 未参加：参加フォーム =====
    joinSectionTitle.textContent = joinClosed
      ? "参加受付終了（再接続のみ）"
      : "チーム参加";
    joinCodeInput.style.display = "block";
    joinCodeInput.disabled = false;
    teamNameInput.disabled = false;
    seatNumberInput.disabled = false;
    joinButton.style.display = "block";
    joinButton.textContent = joinClosed ? "再接続" : "クイズに参加する";
    teamEditActions.style.display = "none";
    return;
  }

  // ===== 参加済み =====
  joinSectionTitle.textContent = isEditingTeamInfo ? "チーム情報を編集" : "チーム情報";
  
  // イベント開始後は編集不可
  if (!canEdit) {
    isEditingTeamInfo = false;
    joinCodeInput.style.display = "none";
    joinButton.style.display = "none";
    teamNameInput.disabled = true;
    seatNumberInput.disabled = true;
    teamEditActions.style.display = "none";
    return;
  }

  if (isEditingTeamInfo) {
    // ===== 編集モード =====
    joinCodeInput.style.display = "block";  // 参加コード表示
    joinCodeInput.disabled = true;  // 参加コードはロック
    teamNameInput.disabled = false;  // チーム名は編集可能
    seatNumberInput.disabled = false;  // 座席番号は編集可能
    joinButton.style.display = "none";  // 参加ボタンは非表示
    teamEditActions.style.display = "flex";  // 決定・キャンセルボタン表示
  } else {
    // ===== 表示モード（参加済みだが未編集） =====
    joinCodeInput.style.display = "none";
    joinButton.style.display = "none";
    teamNameInput.disabled = true;
    seatNumberInput.disabled = true;
    teamEditActions.style.display = "none";
  }
}

// 参加ボタン
joinButton.addEventListener("click", () => {
  socket.emit("joinTeam", {
    teamName: teamNameInput.value.trim(),
    seatNumber: seatNumberInput.value.trim(),
    joinCode: joinCodeInput.value.trim()
  });
});

// 参加後画面の「チーム情報を編集」→ 編集画面に切り替え
editTeamButtonAfterJoin.addEventListener("click", () => {
  // 現在値を保存
  savedTeamName = teamNameInput.value;
  savedSeatNumber = seatNumberInput.value;
  isEditingTeamInfo = true;
  editMessage.textContent = "";
  
  // 編集画面に値を設定
  const joinInfo = loadJoinInfo();
  editJoinCodeInput.value = String(joinInfo?.joinCode || joinCodeInput.value || "").toUpperCase();
  editTeamNameInput.value = savedTeamName || teamNameInput.value;
  editSeatNumberInput.value = savedSeatNumber || seatNumberInput.value || joinInfo?.seatNumber || "";
  
  // 参加後画面を非表示、編集画面を表示
  joinedSection.style.display = "none";
  editSection.style.display = "block";
  editTeamNameInput.focus();
});

// 「決定」→ サーバーへ更新を送る
confirmTeamButton.addEventListener("click", () => {
  socket.emit("updateTeamInfo", {
    teamName: teamNameInput.value.trim(),
    seatNumber: seatNumberInput.value.trim()
  });
});

// 「キャンセル」→ 編集前の値に戻してロック
cancelTeamButton.addEventListener("click", () => {
  teamNameInput.value = savedTeamName;
  seatNumberInput.value = savedSeatNumber;
  isEditingTeamInfo = false;
  joinMessage.textContent = "";
  joinSection.style.display = "none";
  joinedSection.style.display = "flex";
  document.body.classList.add("joined");
  joinCodeInput.disabled = false;
  updateJoinFormMode();
});

// 編集画面の「決定」→ サーバーへ更新を送る
editConfirmButton.addEventListener("click", () => {
  socket.emit("updateTeamInfo", {
    teamName: editTeamNameInput.value.trim(),
    seatNumber: editSeatNumberInput.value.trim()
  });
});

// 編集画面の「キャンセル」→ 参加後画面に戻す
editCancelButton.addEventListener("click", () => {
  isEditingTeamInfo = false;
  editMessage.textContent = "";
  editSection.style.display = "none";
  joinedSection.style.display = "flex";
});

// 座席番号プルダウンを初期化
socket.on("seatNumbersLoaded", (data) => {
  if (Array.isArray(data.seatNumbers)) {
    // 既存のオプションをクリア（プレースホルダーのoption要素は残す）
    while (seatNumberInput.options.length > 1) {
      seatNumberInput.remove(1);
    }
    // 既存のオプションをクリア（editSeatNumberInput）
    while (editSeatNumberInput.options.length > 1) {
      editSeatNumberInput.remove(1);
    }
    // 座席番号をオプションとして追加
    data.seatNumbers.forEach((num) => {
      const option = document.createElement("option");
      option.value = String(num);
      option.textContent = String(num);
      seatNumberInput.appendChild(option);
      
      // editSeatNumberInputにもコピー
      const editOption = document.createElement("option");
      editOption.value = String(num);
      editOption.textContent = String(num);
      editSeatNumberInput.appendChild(editOption);
    });

    // 編集画面表示中なら、保存済みの座席番号を再選択する
    if (editSection.style.display !== "none") {
      editSeatNumberInput.value = savedSeatNumber || seatNumberInput.value || "";
    }
  }
});

// 参加結果受信
socket.on("joinResult", (result) => {
  joinMessage.textContent = result.message;

  if (result.success) {
    myTeamName = result.team.name;
    hasJoined = true;
    document.body.classList.add("joined");
    isEditingTeamInfo = false;
    savedTeamName = teamNameInput.value;
    savedSeatNumber = seatNumberInput.value;
    saveJoinInfo(
      teamNameInput.value.trim(),
      seatNumberInput.value.trim(),
      joinCodeInput.value.trim()
    );
    joinedTeamNameDisplay.textContent = `チーム名：${result.team.name}`;
    joinedSection.style.display = "flex";
    editSection.style.display = "none";
    joinSection.style.display = "none";
    joinSection.style.visibility = "hidden";
    updateJoinFormMode();
  }
});

// チーム情報の更新結果受信
socket.on("updateTeamResult", (result) => {
  joinMessage.textContent = result.message;

  if (result.success) {
    myTeamName = result.team.name;
    savedTeamName = teamNameInput.value;
    savedSeatNumber = seatNumberInput.value;
    isEditingTeamInfo = false;
    saveJoinInfo(
      teamNameInput.value.trim(),
      seatNumberInput.value.trim(),
      (loadJoinInfo() && loadJoinInfo().joinCode) || joinCodeInput.value.trim()
    );
    joinedTeamNameDisplay.textContent = `チーム名：${result.team.name}`;
    editSection.style.display = "none";
    editMessage.textContent = result.message;
    joinSection.style.display = "none";
    joinedSection.style.display = "flex";
    document.body.classList.add("joined");
    joinCodeInput.disabled = false;
    updateJoinFormMode();
  }
});

// 状態更新受信
socket.on("stateUpdated", (state) => {
  // 問題が切り替わった時だけ入力欄やメッセージを初期化
  if (state.currentQuestionId !== lastQuestionId) {
    lastQuestionId = state.currentQuestionId;
    answerMessage.textContent = "";
    setAnswerValue(50);
    setAnswerControlsEnabled(true);
    gaugeContainer.innerHTML = "";
    myTeamResult.style.display = "none";
    myTeamResult.textContent = "";
  }

  const showJoinSection =
    state.status === "waiting" ||
    (!hasJoined &&
      state.status !== "finished" &&
      state.status !== "results_announced") ||
    (hasJoined && state.status === "waiting");
  const showQuestionView =
    state.status === "started" ||
    state.status === "question" ||
    state.status === "answer_closed";
  const showResultView =
    state.status === "answers_revealed" || state.status === "correct_revealed";
  const showSurveyResultsView = state.status === "survey_results";
  // 順位発表中、またはイベント終了時に最終順位を表示
  const showRankingView =
    state.status === "ranking_revealed" || state.status === "finished";
  const showResultsView = state.status === "results_announced";

  currentEventStatus = state.status;

  // 出題・回答中はタイトルを隠してモックアップ寄りの画面にする
  document.body.classList.toggle(
    "answering",
    showQuestionView &&
      (state.status === "question" || state.status === "answer_closed")
  );

  // 出題〜順位発表までは背景をグラデーションにする
  const useGradientBackground =
    state.status === "started" ||
    state.status === "question" ||
    state.status === "answer_closed" ||
    state.status === "answers_revealed" ||
    state.status === "correct_revealed" ||
    state.status === "survey_results" ||
    state.status === "ranking_revealed";
  document.body.classList.toggle("event-gradient-bg", useGradientBackground);

  // 結果発表中はサイド背景に切り替える
  document.body.classList.toggle(
    "results-background-side",
    state.status === "results_announced"
  );

  const useFinishedBackgroundVideo = state.status === "finished";
  document.body.classList.toggle(
    "finished-background-video",
    useFinishedBackgroundVideo
  );
  if (backgroundVideo) {
    if (useFinishedBackgroundVideo) {
      backgroundVideo.currentTime = 0;
      backgroundVideo.play().catch(() => {});
    } else {
      backgroundVideo.pause();
      backgroundVideo.currentTime = 0;
    }
  }

  const showJoinStack = showJoinSection && !hasJoined;
  if (joinStack) {
    joinStack.style.display = showJoinStack ? "flex" : "none";
  }
  joinSection.style.display = showJoinSection ? "block" : "none";
  if (joinWelcomeLogo) {
    joinWelcomeLogo.style.display = showJoinStack ? "block" : "none";
  }

  // 参加後・ waiting / started 中は参加完了画面を表示（編集中は非表示）
  const showJoinedSection =
    hasJoined &&
    state.status === "waiting" &&
    !isEditingTeamInfo;
  joinedSection.style.display = showJoinedSection ? "flex" : "none";

  // started 中はチーム情報変更ボタンを隠す
  if (editTeamButtonAfterJoin) {
    editTeamButtonAfterJoin.style.display = state.status === "started" ? "none" : "inline-block";
  }

  // 参加後画面の案内文言
  if (waitingMessage) {
    if (state.status === "started") {
      waitingMessage.classList.remove("waiting-cutout");
      waitingMessage.textContent = "出題をお待ちください...";
    } else {
      waitingMessage.classList.add("waiting-cutout");
      waitingMessage.innerHTML = `
        <svg class="waiting-cutout-svg" viewBox="0 0 144 32" role="img" aria-label="開始待ち" preserveAspectRatio="xMidYMid meet">
          <defs>
            <mask id="waitingCutoutMask">
              <rect x="0" y="0" width="144" height="32" rx="16" ry="16" fill="white"></rect>
              <text x="72" y="16" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" font-family="'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif" fill="black">● 開始待ち</text>
            </mask>
          </defs>
          <rect x="0" y="0" width="144" height="32" rx="16" ry="16" fill="#000000" mask="url(#waitingCutoutMask)"></rect>
        </svg>`;
    }
  }

  questionView.style.display = showQuestionView ? "block" : "none";
  resultView.style.display = showResultView ? "block" : "none";
  surveyResultsView.style.display = showSurveyResultsView ? "block" : "none";
  rankingView.style.display = showRankingView ? "block" : "none";
  resultsView.style.display = showResultsView ? "block" : "none";

  // リセット後など、チームがいなくなったら参加状態をクリア
  if (hasJoined) {
    const stillInTeams = state.teams.some((team) => team.name === myTeamName);
    if (!stillInTeams && state.status === "waiting") {
      hasJoined = false;
      myTeamName = "";
      isEditingTeamInfo = false;
      joinMessage.textContent = "";
      joinedSection.style.display = "none";
      document.body.classList.remove("joined");
      clearJoinInfo();
    }
  }

  // 参加フォームのロック／編集表示を最新状態に合わせる
  updateJoinFormMode();

  // アンケート画像を問題ごとに切り替え
  if (state.surveyImageUrl) {
    surveyImage.src = state.surveyImageUrl;
  }

  // 状態ごとの表示切り替え（例題は回答練習のみ。正解発表なし）
  if (state.status === "question") {
    statusEl.textContent = state.isPractice
      ? "【例題】操作確認：回答してください（採点・正解発表はありません）"
      : "問題に回答してください";
    answerArea.style.display = "block";
  } else if (state.status === "answer_closed") {
    statusEl.textContent = state.isPractice
      ? "【例題】回答受付は終了しました。本番の開始をお待ちください"
      : "回答受付は終了しました";
    answerArea.style.display = "block";
    setAnswerControlsEnabled(false);
  } else if (state.status === "answers_revealed") {
    statusEl.textContent = "全チームの回答を表示中";
    answerArea.style.display = "none";
    resultTitle.textContent = "回答公開";
    myTeamResult.style.display = "none";
  } else if (state.status === "correct_revealed") {
    statusEl.textContent = "正解発表中";
    answerArea.style.display = "none";
    resultTitle.textContent = "正解発表";
    myTeamResult.style.display = "block";
  } else if (state.status === "survey_results") {
    statusEl.textContent = "アンケート結果公開中";
    answerArea.style.display = "none";
  } else if (state.status === "ranking_revealed") {
    statusEl.textContent = "順位発表中";
    answerArea.style.display = "none";
    rankingTitle.textContent = "順位発表";
  } else if (state.status === "results_announced") {
    statusEl.textContent = "結果発表中";
    answerArea.style.display = "none";
  } else if (state.status === "finished") {
    statusEl.textContent = "イベント終了";
    answerArea.style.display = "none";
    rankingTitle.textContent = "最終順位";
  } else if (state.status === "started") {
    statusEl.textContent = "イベント開始。例題または本番の出題を待っています";
    answerArea.style.display = "block";
    renderQuestionContent(null, "出題をお待ちください");
    questionBadgeNum.textContent = "第--問";
    questionHint.textContent = "まもなく出題されます";
    answerMessage.textContent = "出題をお待ちください";
    setAnswerControlsEnabled(false);
  } else if (state.status === "waiting") {
    statusEl.textContent = "参加受付中";
    answerArea.style.display = "none";
  }

  if (
    state.status !== "waiting" &&
    state.status !== "started" &&
    state.status !== "finished" &&
    state.status !== "results_announced"
  ) {
    renderQuestionContent(
      state.currentQuestion,
      "まだ問題は表示されていません"
    );

    timerValue.textContent = formatRemainingTime(state.remainingTime);
    updateQuestionMeta(state);

    if (state.isPractice) {
      correctAnswerText.textContent = "例題（正解発表なし）";
    } else {
      correctAnswerText.textContent =
        state.correctAnswer !== null
          ? `正解: ${state.correctAnswer}%`
          : "正解: --";
    }
  }

  const myTeam = state.teams.find((team) => team.name === myTeamName);
  scoreText.textContent = myTeam
    ? `スコア： ${myTeam.score} pt`
    : "スコア： -- pt";
  if (questionProgress) {
    questionProgress.textContent = scoreText.textContent;
  }

  // ゲージは回答公開・正解発表のときだけ描画
  if (showResultView) {
    renderGauge(state, myTeam);
  }

  // 順位発表画面の描画
  renderRanking(state);
  renderQuestionReview(state);
  renderPodium(state, showResultsView);
});

function renderRanking(state) {
  rankingList.innerHTML = "";

  if (state.status !== "ranking_revealed" && state.status !== "finished") {
    myRankText.textContent = "あなたの順位: --";
    return;
  }

  let myRank = null;

  state.ranking.forEach((team, index) => {
    const rank = index + 1;
    const li = document.createElement("li");
    li.textContent = `${rank}位 ${team.name} - ${team.score}点`;

    // 自チームの行を強調表示
    if (team.name === myTeamName) {
      li.className = "ranking-item-own";
      myRank = rank;
    }

    rankingList.appendChild(li);
  });

  myRankText.textContent =
    myRank !== null ? `あなたの順位: ${myRank}位` : "あなたの順位: --";
}

// イベント終了時：出題済み問題と自チームの回答を表示（未出題は含めない）
function renderQuestionReview(state) {
  questionReviewList.innerHTML = "";

  if (state.status !== "finished") {
    questionReviewSection.style.display = "none";
    return;
  }

  const history = Array.isArray(state.answerHistory) ? state.answerHistory : [];
  if (history.length === 0) {
    questionReviewSection.style.display = "none";
    return;
  }

  history.forEach((entry, index) => {
    const teamAnswer = (entry.teamAnswers || []).find(
      (item) => item.teamName === myTeamName
    );
    const answerText =
      teamAnswer && teamAnswer.answer !== null && teamAnswer.answer !== undefined
        ? `${teamAnswer.answer}%`
        : "未回答";
    const correctText =
      entry.correctAnswer !== null && entry.correctAnswer !== undefined
        ? `${entry.correctAnswer}%`
        : "--";

    const li = document.createElement("li");
    li.className = "question-review-item";
    li.innerHTML = `
      <p class="question-review-num">問題 ${index + 1}</p>
      <p class="question-review-text"></p>
      <p class="question-review-meta">あなたの回答: <strong></strong></p>
      <p class="question-review-meta">正解: <strong></strong></p>
    `;
    li.querySelector(".question-review-text").textContent = String(
      entry.questionText || ""
    ).replace(/\{\{([A-Da-d])\}\}/g, "$1");
    li.querySelectorAll(".question-review-meta strong")[0].textContent = answerText;
    li.querySelectorAll(".question-review-meta strong")[1].textContent = correctText;
    questionReviewList.appendChild(li);
  });

  questionReviewSection.style.display = "block";
}

// 結果発表：管理者が 3位→2位→1位 の順で公開するたびに表示
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

  // 見た目の並び: 2位 | 1位 | 3位（未公開の順位は描画しない）
  const displayOrder = [1, 0, 2].filter((index) => {
    if (index >= topTeams.length) {
      return false;
    }
    const place = index + 1;
    return revealedPlaces.has(place);
  });

  displayOrder.forEach((rankIndex) => {
    const team = topTeams[rankIndex];
    const place = rankIndex + 1;
    const item = document.createElement("div");
    item.className = `podium-place podium-place--${place}`;

    const crownHtml =
      place === 1
        ? `<span class="podium-crown" aria-hidden="true">👑</span>`
        : "";

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

    if (team.name === myTeamName) {
      item.classList.add("podium-place--own");
    }

    if (previouslyRevealed.has(place)) {
      item.classList.add("is-visible");
    }

    podium.appendChild(item);
  });

  // 今回新しく公開された順位だけアニメーション
  requestAnimationFrame(() => {
    podium.querySelectorAll(".podium-place").forEach((el) => {
      if (!el.classList.contains("is-visible")) {
        el.classList.add("is-visible");
      }
    });
  });
}

function renderGauge(state, myTeam) {
  gaugeContainer.innerHTML = "";
  myTeamResult.style.display = "none";
  myTeamResult.textContent = "";

  if (!state.revealedAnswers || state.revealedAnswers.length === 0) {
    return;
  }

  const showCorrect = state.status === "correct_revealed";
  const correctValue =
    state.correctAnswer !== null ? clampAnswer(state.correctAnswer) : null;

  let myAnswer = null;
  const teamMarkers = [];

  state.revealedAnswers.forEach((item) => {
    if (item.answer === null) {
      return;
    }

    const percent = clampAnswer(item.answer);
    const isOwn = item.teamName === myTeamName;

    if (isOwn) {
      myAnswer = percent;
    }

    teamMarkers.push({
      teamName: item.teamName,
      percent,
      isOwn
    });
  });

  const tacho = renderTachometer({
    teamMarkers,
    myAnswer,
    correctValue: showCorrect ? correctValue : null,
    showCorrect
  });

  gaugeContainer.appendChild(tacho.root);

  const showMyTeamResult = myTeam && showCorrect;
  if (showMyTeamResult) {
    const answerText = myAnswer !== null ? `${myAnswer}%` : "未回答";
    let scoreDeltaText = "";

    if (myAnswer !== null && state.correctAnswer !== null) {
      const diff = Math.abs(myAnswer - state.correctAnswer);
      let delta = -diff;
      if (myAnswer === state.correctAnswer) {
        delta += 50;
      }
      scoreDeltaText = `（この問題の得点: ${delta >= 0 ? "+" + delta : delta}点）`;
    }

    myTeamResult.textContent = `${myTeam.name} / 回答: ${answerText} ${scoreDeltaText}`;
    myTeamResult.style.display = "block";
  }
}

const TACHO = {
  cx: 150,
  cy: 150,
  radius: 108,
  needleLen: 92
};

function percentToRad(percent) {
  return Math.PI * (1 - percent / 100);
}

function tachoPoint(percent, radius = TACHO.radius) {
  const rad = percentToRad(percent);
  return {
    x: TACHO.cx + radius * Math.cos(rad),
    y: TACHO.cy - radius * Math.sin(rad)
  };
}

function valueToRotateDeg(value) {
  return value * 1.8 - 90;
}

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, val]) => {
    el.setAttribute(key, String(val));
  });
  return el;
}

function renderTachometer({ teamMarkers, myAnswer, correctValue, showCorrect }) {
  const root = document.createElement("div");
  root.className = "tacho-gauge";

  const svg = createSvgEl("svg", {
    viewBox: "0 0 300 180",
    class: "tacho-svg",
    role: "img",
    "aria-label": "回答タコメーター"
  });

  const defs = createSvgEl("defs");
  const gradient = createSvgEl("linearGradient", {
    id: "tachoArcGradient",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "0%"
  });
  gradient.appendChild(
    createSvgEl("stop", { offset: "0%", "stop-color": "#93c5fd" })
  );
  gradient.appendChild(
    createSvgEl("stop", { offset: "100%", "stop-color": "#2563eb" })
  );
  defs.appendChild(gradient);
  svg.appendChild(defs);

  const arcStart = tachoPoint(0, TACHO.radius);
  const arcEnd = tachoPoint(100, TACHO.radius);

  svg.appendChild(
    createSvgEl("path", {
      d: `M ${arcStart.x} ${arcStart.y} A ${TACHO.radius} ${TACHO.radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`,
      class: "tacho-arc-bg"
    })
  );

  svg.appendChild(
    createSvgEl("path", {
      d: `M ${arcStart.x} ${arcStart.y} A ${TACHO.radius} ${TACHO.radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`,
      class: "tacho-arc-fill"
    })
  );

  [0, 25, 50, 75, 100].forEach((tick) => {
    const outer = tachoPoint(tick, TACHO.radius);
    const inner = tachoPoint(tick, TACHO.radius - (tick % 50 === 0 ? 14 : 8));
    svg.appendChild(
      createSvgEl("line", {
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        class: tick % 50 === 0 ? "tacho-tick-major" : "tacho-tick-minor"
      })
    );

    if (tick % 50 === 0) {
      const labelPoint = tachoPoint(tick, TACHO.radius - 24);
      const label = createSvgEl("text", {
        x: labelPoint.x,
        y: labelPoint.y,
        class: "tacho-scale-label",
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      });
      label.textContent = `${tick}`;
      svg.appendChild(label);
    }
  });

  teamMarkers.forEach((marker) => {
    if (marker.isOwn) {
      return;
    }

    const point = tachoPoint(marker.percent, TACHO.radius - 2);
    svg.appendChild(
      createSvgEl("circle", {
        cx: point.x,
        cy: point.y,
        r: 5,
        class: "tacho-team-dot"
      })
    );
  });

  if (myAnswer !== null) {
    const ownNeedle = createNeedleGroup("tacho-needle tacho-needle-own", myAnswer);
    svg.appendChild(ownNeedle);
  }

  if (showCorrect && correctValue !== null) {
    const correctNeedle = createNeedleGroup(
      "tacho-needle tacho-needle-correct",
      correctValue
    );
    svg.appendChild(correctNeedle);
  }

  svg.appendChild(
    createSvgEl("circle", {
      cx: TACHO.cx,
      cy: TACHO.cy,
      r: 10,
      class: "tacho-hub"
    })
  );

  svg.appendChild(
    createSvgEl("circle", {
      cx: TACHO.cx,
      cy: TACHO.cy,
      r: 4,
      class: "tacho-hub-center"
    })
  );

  root.appendChild(svg);

  const centerValue = document.createElement("div");
  centerValue.className = "tacho-center-value";
  if (showCorrect && correctValue !== null) {
    centerValue.innerHTML = `<span class="tacho-center-label">正解</span><span class="tacho-center-num">${correctValue}<small>%</small></span>`;
  } else if (myAnswer !== null) {
    centerValue.innerHTML = `<span class="tacho-center-label">あなた</span><span class="tacho-center-num">${myAnswer}<small>%</small></span>`;
  } else {
    centerValue.innerHTML = `<span class="tacho-center-label">回答</span><span class="tacho-center-num">--<small>%</small></span>`;
  }
  root.appendChild(centerValue);

  const legend = document.createElement("ul");
  legend.className = "tacho-legend";

  teamMarkers
    .slice()
    .sort((a, b) => a.percent - b.percent)
    .forEach((marker) => {
      const li = document.createElement("li");
      li.className = marker.isOwn ? "tacho-legend-own" : "tacho-legend-item";
      li.innerHTML = `<span class="tacho-legend-name">${marker.teamName}${marker.isOwn ? "（あなた）" : ""}</span><span class="tacho-legend-value">${marker.percent}%</span>`;
      legend.appendChild(li);
    });

  if (showCorrect && correctValue !== null) {
    const li = document.createElement("li");
    li.className = "tacho-legend-correct";
    li.innerHTML = `<span class="tacho-legend-name">正解</span><span class="tacho-legend-value">${correctValue}%</span>`;
    legend.appendChild(li);
  }

  root.appendChild(legend);

  requestAnimationFrame(() => {
    root.querySelectorAll(".tacho-needle").forEach((needle) => {
      const target = Number(needle.dataset.target);
      needle.style.transform = `rotate(${valueToRotateDeg(target)}deg)`;
    });
  });

  return { root };
}

function createNeedleGroup(className, value) {
  const group = createSvgEl("g", {
    class: `${className} tacho-needle`
  });
  group.dataset.target = String(value);

  group.appendChild(
    createSvgEl("line", {
      x1: TACHO.cx,
      y1: TACHO.cy,
      x2: TACHO.cx,
      y2: TACHO.cy - TACHO.needleLen,
      class: "tacho-needle-line"
    })
  );

  group.appendChild(
    createSvgEl("circle", {
      cx: TACHO.cx,
      cy: TACHO.cy - TACHO.needleLen + 6,
      r: 4,
      class: "tacho-needle-tip"
    })
  );

  return group;
}

answerDecButton.addEventListener("click", () => {
  setAnswerValue(clampAnswer(answerInput.value) - 1);
});

answerIncButton.addEventListener("click", () => {
  setAnswerValue(clampAnswer(answerInput.value) + 1);
});

answerSlider.addEventListener("input", () => {
  setAnswerValue(answerSlider.value);
});

answerInput.addEventListener("change", () => {
  setAnswerValue(answerInput.value);
});

answerInput.addEventListener("blur", () => {
  if (answerInput.value === "") {
    setAnswerValue(50);
    return;
  }
  setAnswerValue(answerInput.value);
});

// 回答送信
submitAnswerButton.addEventListener("click", () => {
  const answer = clampAnswer(answerInput.value);
  setAnswerValue(answer);
  socket.emit("submitAnswer", answer);
});

// 回答受付結果
socket.on("answerResult", (result) => {
  answerMessage.textContent = result.message;

  if (result.success) {
    setAnswerControlsEnabled(false);
  }
});