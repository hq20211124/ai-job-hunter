const portInput = document.getElementById('port');
const status = document.getElementById('status');

chrome.storage.local.get({ port: 61822 }, (data) => {
  portInput.value = data.port;
});

portInput.addEventListener('change', () => {
  const port = parseInt(portInput.value, 10);
  if (port >= 1024 && port <= 65535) {
    chrome.storage.local.set({ port }, () => {
      status.style.display = 'block';
      setTimeout(() => { status.style.display = 'none'; }, 2000);
    });
  }
});
