// Minimal Obsidian API mock for Jest tests
// Obsidian-dependent classes (fileIO, composers) are NOT tested here.
// Only pure logic classes (Block, BlockCollection, noteBlocksParser) use this.

export class Plugin {}
export class PluginSettingTab {}
export class TFile { basename = ''; path = ''; }
export class Notice { constructor(msg: string) {} }
export class Setting {
  setName(s: string) { return this; }
  setDesc(s: string) { return this; }
  addText(cb: any) { return this; }
  addToggle(cb: any) { return this; }
}
export class App {}
