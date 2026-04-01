// セッションが既に存在する場合はモーダルをスキップし、バナーを表示
const existingSession = sessionStorage.getItem("whyuseyt_session");
if (existingSession) {
  document.addEventListener("DOMContentLoaded", () => {
    const session = JSON.parse(existingSession);
    showPurposeBadge(session.reason);
  });
} else {
  // YouTube を即座に非表示にする（document_start 時点で <html> は存在する）
  const hideStyle = document.createElement("style");
  hideStyle.id = "whyuseyt-hide";
  hideStyle.textContent =
    "html { visibility: hidden !important; overflow: hidden !important; }";
  document.documentElement.appendChild(hideStyle);

  // <body> が存在するようになったらモーダルを挿入
  document.addEventListener("DOMContentLoaded", () => {
    showPurposeModal(hideStyle);
  });
}

function showPurposeModal(hideStyle: HTMLStyleElement): void {
  const overlay = document.createElement("div");
  overlay.id = "whyuseyt-overlay";

  const dialog = document.createElement("div");
  dialog.id = "whyuseyt-dialog";

  const heading = document.createElement("h2");
  heading.textContent = "なぜ YouTube を見る必要がありますか？";

  const description = document.createElement("p");
  description.textContent =
    "なんのために YouTube を見るのか、目的を入力してください";

  const textarea = document.createElement("textarea");
  textarea.id = "whyuseyt-textarea";
  textarea.placeholder = "例: プログラミングのチュートリアルを見る";

  const submitBtn = document.createElement("button");
  submitBtn.id = "whyuseyt-submit";
  submitBtn.textContent = "YouTube を開く";
  submitBtn.disabled = true;

  dialog.appendChild(heading);
  dialog.appendChild(description);
  dialog.appendChild(textarea);
  dialog.appendChild(submitBtn);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  textarea.addEventListener("input", () => {
    submitBtn.disabled = textarea.value.trim().length === 0;
  });

  submitBtn.addEventListener("click", () => {
    const session = {
      reason: textarea.value.trim(),
      startTime: Date.now(),
      url: location.href,
    };
    sessionStorage.setItem("whyuseyt_session", JSON.stringify(session));

    overlay.remove();
    hideStyle.remove();
    showPurposeBadge(textarea.value.trim());
  });
}

function showPurposeBadge(reason: string): void {
  const badge = document.createElement("div");
  badge.id = "whyuseyt-badge";
  badge.title = reason;
  badge.textContent = "🎯";
  document.body.appendChild(badge);

  const tooltip = document.createElement("div");
  tooltip.id = "whyuseyt-tooltip";
  tooltip.textContent = reason;
  document.body.appendChild(tooltip);

  badge.addEventListener("click", () => {
    tooltip.classList.toggle("whyuseyt-tooltip-visible");
  });

  document.addEventListener("click", (e) => {
    if (e.target !== badge && e.target !== tooltip) {
      tooltip.classList.remove("whyuseyt-tooltip-visible");
    }
  });
}
