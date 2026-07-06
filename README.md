# Perplexity Preferred Model

这是一个给 Edge / Chrome 使用的本地扩展。打开 `perplexity.ai` 后，它会观察页面上的模型选择器，并尽量把默认的 `最佳` / `Best` / `Auto` 切换成你指定的模型。

默认目标模型是：

```text
Claude Sonnet 5.0
```

## 安装

1. 打开 Edge：`edge://extensions/`
2. 开启 `开发人员模式`
3. 点击 `加载解压缩的扩展`
4. 选择本目录：`perplexity_auto_model`

修改源码后，需要在 `edge://extensions/` 里点击这个扩展的 `重新加载`，再刷新 Perplexity 页面。

## 修改目标模型

点击浏览器工具栏里的 `P` 图标，可以直接输入 `指定模型` 并点击 `应用`。

模型输入支持轻量模糊匹配。例如输入 `sonnet 5.0` 时，会优先匹配菜单里的 `Claude Sonnet 5.0`；输入 `gemini pro` 时，会尝试匹配最接近的 Gemini Pro 模型。

弹窗里还有 `启用思考` 选项。默认关闭；勾选后，扩展会在应用模型时尝试打开 Perplexity 模型菜单里的 `正在思考` / `Thinking` 开关。

通过 `P` 弹窗应用模型时，匹配别名会被重置为当前输入的模型名，避免旧模型别名影响选择。如果当前菜单里找不到这个模型，扩展会提示一次并停止重试；你重新输入并点击 `应用` 后会再次尝试。

也可以在高级选项里修改：

1. 在 `edge://extensions/` 找到 `Perplexity Preferred Model`
2. 点击 `详细信息`
3. 点击 `扩展选项`
4. 修改 `指定模型`，然后点击 `保存并应用`

扩展不会维护 Perplexity 的完整模型列表。你自己输入当前想用的模型名，保存后扩展会在已打开的 Perplexity 页面上立即尝试应用。

如果 Perplexity 页面上展示的模型名字和保存的名字不完全一致，把页面里看到的名字加到 `匹配别名`，一行一个。保存时，`指定模型` 会自动加入匹配别名。

如果菜单里找不到这个模型，扩展选项页会提示你重新输入一个当前存在的模型。

## 公司代理

扩展内容脚本不能稳定地替整个浏览器接管公司代理。推荐任选一种方式：

### 使用 Windows / Edge 系统代理

在 Windows 设置里配置 HTTP 代理：

```text
http://172.17.45.120:7890
```

### 使用本目录启动脚本

```powershell
.\Start-Perplexity-Edge.ps1
```

脚本默认使用：

```text
http://172.17.45.120:7890
```

### 使用单独的 Edge 启动参数

关闭现有 Edge 后，用 PowerShell 启动：

```powershell
Start-Process msedge.exe -ArgumentList '--proxy-server=http://172.17.45.120:7890'
```

如果你希望不影响平时的 Edge 配置，可以使用单独用户数据目录：

```powershell
Start-Process msedge.exe -ArgumentList '--user-data-dir=%TEMP%\edge-perplexity-profile --proxy-server=http://172.17.45.120:7890 https://www.perplexity.ai/'
```

## 调试

如果没有自动切换：

1. 打开扩展选项，勾选 `输出调试日志`
2. 在 Perplexity 页面按 `F12`
3. 查看 Console 里以 `[Perplexity Preferred Model]` 开头的日志

Perplexity 的前端结构可能更新。如果按钮文案变了，优先在扩展选项里更新 `匹配别名` 和 `需要被替换的当前模型标签`。
