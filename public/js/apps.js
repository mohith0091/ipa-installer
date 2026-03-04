document.addEventListener('DOMContentLoaded', async () => {
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const errorMessage = document.getElementById('errorMessage');
  const appsList = document.getElementById('appsList');
  const appsActions = document.getElementById('appsActions');

  try {
    const response = await fetch('/api/apps');

    if (!response.ok) {
      showError('Failed to load apps. Please try again.');
      return;
    }

    const data = await response.json();

    if (!data.success || !data.apps || data.apps.length === 0) {
      showEmpty();
      return;
    }

    showApps(data.apps);
  } catch (err) {
    showError('Network error. Please check your connection and try again.');
  }

  function showApps(apps) {
    loadingState.style.display = 'none';
    appsList.style.display = '';
    appsActions.style.display = '';

    for (const app of apps) {
      const card = document.createElement('a');
      card.className = 'app-list-card';
      card.href = '/app/' + app.id;

      var sizeMB = '';
      if (app.fileSize) {
        sizeMB = (app.fileSize / (1024 * 1024)).toFixed(1) + ' MB';
      }

      var uploadDate = '';
      if (app.uploadedAt) {
        var d = new Date(app.uploadedAt);
        uploadDate = d.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      card.innerHTML =
        '<img class="app-list-icon" src="' + escapeAttr(app.iconUrl) + '" alt="App Icon" onerror="this.src=\'/images/default-icon.png\'">' +
        '<div class="app-list-details">' +
          '<div class="app-list-name">' + escapeHtml(app.name) + '</div>' +
          '<div class="app-list-meta">' +
            '<span>v' + escapeHtml(app.version) + '</span>' +
            (app.buildNumber ? '<span>Build ' + escapeHtml(app.buildNumber) + '</span>' : '') +
            (sizeMB ? '<span>' + sizeMB + '</span>' : '') +
          '</div>' +
          '<div class="app-list-bundle">' + escapeHtml(app.bundleId) + '</div>' +
          (uploadDate ? '<div class="app-list-date">' + uploadDate + '</div>' : '') +
        '</div>' +
        '<div class="app-list-arrow">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="9 18 15 12 9 6"/>' +
          '</svg>' +
        '</div>';

      appsList.appendChild(card);
    }
  }

  function showEmpty() {
    loadingState.style.display = 'none';
    emptyState.style.display = '';
  }

  function showError(message) {
    loadingState.style.display = 'none';
    errorMessage.textContent = message;
    errorMessage.classList.add('active');
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
