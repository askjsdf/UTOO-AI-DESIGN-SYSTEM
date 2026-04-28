/** @type {import('electron-builder').Configuration} */
module.exports = {
  // ── 应用标识（升级时永远不要改这两个字段）────────────────────────
  appId: 'com.utoo.design-engine',
  productName: 'UTOO设计引擎',

  directories: {
    output: 'release',
  },

  // 只打包需要的文件进 asar
  files: [
    'dist/**/*',
    'dist-electron/**/*',
    'package.json',
  ],

  // ── macOS ────────────────────────────────────────────────────────
  mac: {
    target: [
      { target: 'dmg', arch: ['arm64'] },
    ],
    category: 'public.app-category.productivity',
    icon: 'build-resources/icon.icns',
  },

  dmg: {
    title: 'UTOO 设计引擎',
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },

  // ── Windows ──────────────────────────────────────────────────────
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build-resources/icon.ico',
  },

  nsis: {
    oneClick: true,
    perMachine: false,
    deleteAppDataOnUninstall: false,
  },
}
