const icons = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.2v-6.2H9.2V21H4a1 1 0 0 1-1-1v-9.5Z"/>',
  theater: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 5v14M17 5v14M3 10h4M17 10h4M3 14h4M17 14h4"/>',
  shorts: '<rect x="7" y="3" width="10" height="18" rx="3"/><path d="m11 9 4 3-4 3V9Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  play: '<path d="M8 5v14l11-7-11-7Z"/>',
  volume: '<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  hot: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.2-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
  refresh: '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 10a7 7 0 0 0-12-3L4 9"/><path d="M5.5 14a7 7 0 0 0 12 3L20 15"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  rank: '<path d="M5 19V9M12 19V5M19 19v-7"/>',
  heart: '<path d="M12 21s-7-4.35-9.2-8.18C.75 9.25 2.7 5 6.7 5c2.05 0 3.35 1.12 4.05 2.08C11.45 6.12 12.75 5 14.8 5c4 0 5.95 4.25 3.9 7.82C16.5 16.65 12 21 12 21z"/>',
  thumbs: '<path d="M7 10v10H4V10h3Z"/><path d="M7 10l4-7 1.5 1c.7.5 1 1.4.7 2.2L12.5 9H19a2 2 0 0 1 2 2.3l-1 6.2A3 3 0 0 1 17 20H7V10Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.7 6.8-4.4M8.6 13.3l6.8 4.4"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  rotate: '<path d="M7 4h7a4 4 0 0 1 4 4v1"/><path d="m20 7-2-2-2 2"/><rect x="6" y="9" width="12" height="9" rx="2"/><path d="M10 21h4"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  more: '<path d="M12 6h.01M12 12h.01M12 18h.01"/>',
  clean: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  cast: '<path d="M4 7V5h16v14h-5"/><path d="M4 15a4 4 0 0 1 4 4M4 19h.01M4 11a8 8 0 0 1 8 8"/>',
  speed: '<path d="M4 14a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/><path d="M12 14h.01"/>',
  pip: '<rect x="3" y="5" width="18" height="14" rx="3"/><rect x="12" y="12" width="6" height="4" rx="1"/>',
}

export function icon(name) {
  return icons[name] || icons.grid
}
