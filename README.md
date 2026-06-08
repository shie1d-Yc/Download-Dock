# Download Dock

Download Dock 是一个基于 Chrome Manifest V3 的下载管理扩展。它提供一个紧凑的浏览器弹窗，用接近 Microsoft Edge 下载面板的交互方式集中管理 Chrome 下载记录，适合希望在插件弹窗中快速查看、定位、删除和处理下载项的用户。

项目使用原生 HTML、CSS 和 JavaScript 实现，不依赖构建工具、Tailwind、远程 CDN 或第三方运行时。

## 主要功能

- 查看最近下载记录，并按下载开始时间倒序展示。
- 支持滚动分页加载，每次按批次读取更多历史下载项。
- 显示下载文件名、文件大小、下载时间、下载进度和当前状态。
- 根据文件类型展示不同图标，包括应用、压缩包、文档、图片和通用文件。
- 搜索下载记录，支持按关键字过滤 Chrome 下载历史。
- 双击已完成的下载项可尝试打开文件。
- 在文件夹中定位单个下载文件。
- 打开系统默认下载文件夹。
- 删除本地磁盘文件，并同步清除对应的 Chrome 下载历史记录。
- 对已删除、已中断或已拒绝的下载记录使用删除线状态展示。
- 取消正在进行中的下载任务。
- 识别 Chrome 标记的危险、可疑或未经验证的下载项。
- 为危险下载提供展开操作区，可选择保留或拒绝。
- 一键打开完整的 `chrome://downloads/` 下载记录页面。


## 项目结构

```text
Download Dock/
  manifest.json
  README.md
  src/
    popup/
      popup.html
      popup.css
      popup.js
    assets/
      icons/
        extension-16.png
        extension-32.png
        extension-48.png
        extension-128.png
        app.png
        archive.png
        cancel.png
        chevron-right.png
        close.png
        download.png
        external.png
        file-document.png
        file-generic.png
        file-image.png
        folder.png
        refresh.png
        search.png
        trash.png
        warning.png
```

## 本地安装

1. 打开 Chrome，进入 `chrome://extensions/`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目根目录 `Download Dock`。
5. 点击浏览器工具栏中的 Download Dock 图标，即可打开下载管理弹窗。

## 适用场景

Download Dock 适合习惯了 Edge 下载面板操作逻辑的用户，希望快速搜索下载记录、定位文件、删除文件或处理危险下载提示的使用场景。
