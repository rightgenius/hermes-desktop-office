(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LogUtils = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

  function normalizeLevel(level) {
    const normalized = String(level || 'INFO').trim().toUpperCase();
    return LEVELS.includes(normalized) ? normalized : 'INFO';
  }

  function formatDisplayTime(date) {
    return [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0'),
    ].join(':') + `.${String(date.getMilliseconds()).padStart(3, '0')}`;
  }

  function createLogEntry(text, now = new Date()) {
    const raw = String(text || '');
    const match = raw.match(/^\[(INFO|WARN|WARNING|ERROR|DEBUG)\]\s*(.*)$/i);
    const level = match ? normalizeLevel(match[1] === 'WARNING' ? 'WARN' : match[1]) : 'INFO';
    return {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
      level,
      raw,
      message: match ? match[2] : raw,
      createdAt: now.toISOString(),
      displayTime: formatDisplayTime(now),
    };
  }

  function filterLogEntries(entries, options = {}) {
    const level = String(options.level || 'ALL').toUpperCase();
    const query = String(options.query || '').trim().toLowerCase();
    return entries.filter(entry => {
      if (level !== 'ALL' && entry.level !== level) return false;
      if (!query) return true;
      return entry.raw.toLowerCase().includes(query) || entry.message.toLowerCase().includes(query);
    });
  }

  function countLogLevels(entries) {
    return entries.reduce((counts, entry) => {
      counts.total += 1;
      counts[entry.level] = (counts[entry.level] || 0) + 1;
      return counts;
    }, { total: 0, INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0 });
  }

  function formatLogExport(entries) {
    if (!entries.length) return '';
    return `${entries.map(entry => `${entry.createdAt} ${entry.raw}`).join('\n')}\n`;
  }

  return {
    LEVELS,
    createLogEntry,
    filterLogEntries,
    countLogLevels,
    formatLogExport,
  };
});
