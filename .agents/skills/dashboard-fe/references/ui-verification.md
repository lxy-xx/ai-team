# 界面验证参考

可见 dashboard 或 architecture page 变更后使用。

## 验证方式

- 需要时用 `npm run dev` 启动 dev server。
- 在浏览器尺寸 viewport 打开变更页面。
- 检查 scrolling、overlap、squeezed controls、clipped text、unreadable contrast、responsive layout。
- 检查 settings、channel、provider 页面不会在 DOM 或 API response 中泄露 secrets。
- 行为变更后运行相关 focused tests 和 `npm test`。

## 判断标准

Dashboard 是长期操作界面，不是展示海报。优先信息密度、可扫描性、状态清楚、操作反馈明确；不要为装饰牺牲可读性。
