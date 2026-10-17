const reviewRoot = document.querySelector('#review-root');
const toast = document.querySelector('#toast');
let dashboard = null;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function bindActions() {
  document.querySelector('#review-export')?.addEventListener('click', async () => {
    const result = await window.gamebuddyBridge?.exportReview?.();
    showToast(result?.ok ? '个人数据已导出' : '已取消导出');
  });
  document.querySelector('#review-clear')?.addEventListener('click', async () => {
    if (!window.confirm('确认清空本机全部个人数据？此操作不能撤销。')) return;
    const token = await window.gamebuddyBridge?.requestReviewClear?.();
    const result = await window.gamebuddyBridge?.clearReview?.(token);
    if (!result?.ok) {
      showToast('清空失败，请重试');
      return;
    }
    dashboard = result.dashboard;
    render();
    showToast('本机个人数据已清空');
  });
}

function render() {
  reviewRoot.innerHTML = window.GameBuddyReviewUi?.render(dashboard) || '';
  bindActions();
}

async function loadDashboard() {
  try {
    dashboard = await window.gamebuddyBridge?.getReviewDashboard?.();
  } catch {
    dashboard = { recoveryWarning: '个人数据暂时无法读取，请关闭窗口后重试。' };
  }
  render();
}

document.querySelector('#minimize-button')?.addEventListener('click', () => window.windowControls?.minimize());
document.querySelector('#close-button')?.addEventListener('click', () => window.windowControls?.close());
window.gamebuddyBridge?.onReviewChanged(nextDashboard => {
  dashboard = nextDashboard;
  render();
});

void loadDashboard();
