# FileBeam — P2P 文件共享

基于 WebRTC 的点对点文件共享工具。文件直接在浏览器之间传输，不经过服务器。端到端加密确保只有接收方能解密文件内容，用户可在界面上一键开关。创建一个房间，分享 6 位房间号，即可开始安全传输。

## 特性

### 核心功能

- **P2P 直连传输** — WebRTC DataChannel，文件直接从浏览器到浏览器，不经过任何服务器
- **端到端加密** — ECDH P-256 密钥协商 + AES-256-GCM 认证加密。界面上可一键开关，不可用时自动降级并提示
- **房间制共享** — 创建房间获得 6 位房间号，对方输入即可加入，无需注册登录
- **多人传输** — 一个房间最多支持 10 个设备，可向所有在线设备发送文件
- **局域网 + 远程** — 同网络 LAN 直连高速传输，跨网络自动通过 TURN 中继
- **连接模式指示** — 实时显示当前连接：LAN 直连（绿色）、TURN 中继（黄色）
- **传输控制** — 暂停、续传、取消正在进行的传输
- **发送方显示** — 传输列表中显示"来自 {对方名称}"，带头像色点
- **随机身份** — 自动生成中文昵称和头像颜色，点击可修改

### 技术特性

- **分片传输** — 64KB 分片 + 二进制帧编码（24 字节头），支持大文件（最大 2GB）
- **流量控制** — 基于 DataChannel 缓冲区水位（512KB 高水位 / 128KB 低水位）自动调节
- **加密可选** — 页面头部实时显示加密状态，用户可一键切换；非安全上下文自动降级
- **信令自动探测** — 从浏览器地址栏推断信令服务器地址，同 WiFi 下手机扫码即用
- **自动重连** — WebSocket 断线自动重连
- **房间清理** — 超 1 小时无活动自动过期
- **暗色主题** — 现代化暗色界面，响应式布局适配桌面、平板、手机

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3 + Composition API + TypeScript |
| UI 组件库 | Naive UI |
| 状态管理 | Pinia |
| 路由 | Vue Router (Hash 模式) |
| P2P 传输 | WebRTC (RTCPeerConnection + DataChannel) |
| 端到端加密 | Web Crypto API (ECDH P-256 + HKDF-SHA-256 + AES-256-GCM) |
| 信令服务 | Node.js + ws (WebSocket) |
| 构建工具 | Vite |
| 测试 | Vitest + Vue Test Utils |
| 包管理 | npm workspaces (monorepo) |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9
- 现代浏览器（Chrome / Edge / Firefox）

### 安装

```bash
git clone <repo-url>
cd p2p-filebeam
npm install
```

### 配置环境变量

```bash
cp .env.example .env
```

```env
# 信令服务器地址（可选，不配置则自动从当前页面地址推断）
# 仅在信令服务器与前端不在同一主机时需要手动配置
# VITE_SIGNALING_URL=ws://localhost:7766

# ICE 服务器配置（STUN/TURN）
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

**信令地址自动检测**：前端从浏览器地址栏推断，无需手动配置：

| 访问地址 | 自动连接 |
|----------|----------|
| `http://localhost:7755` | `ws://localhost:7766` |
| `http://192.168.1.5:7755` | `ws://192.168.1.5:7766` |
| `https://example.com` | `wss://example.com/ws` |

> 这意味着同一 WiFi 下的手机扫码即可访问，不用改任何配置。

服务端环境变量：

```bash
SIGNALING_PORT=7766   # 信令服务器端口，默认 7766
```

### 启动开发环境

```bash
npm run dev          # 同时启动前后端
npm run dev:server   # 仅信令服务器 → ws://localhost:7766
npm run dev:client   # 仅前端 → http://localhost:7755
```

### 加密与 HTTPS

端到端加密依赖浏览器 Web Crypto API，该 API 仅在**安全上下文**中可用：

| 访问方式 | 加密状态 |
|----------|----------|
| `https://...` | 🟢 可用 |
| `http://localhost:7755` | 🟢 可用（浏览器信任 localhost） |
| `http://192.168.x.x:7755` | 🔴 不可用（非安全上下文） |
| `http://<域名>` | 🔴 不可用 |

手机通过 HTTP 访问时加密会自动降级，页面上显示红色"加密不可用"。如需在手机上启用加密，有两种方式：

**方式一：Vite 内置 HTTPS（推荐开发环境）**

```bash
npm install -D @vitejs/plugin-basic-ssl
```

```ts
// client/vite.config.ts
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [basicSsl(), vue()],
})
```

手机访问 `https://192.168.1.x:7755`（自签名证书需手动信任）。

**方式二：Nginx 反向代理（生产环境）**

参见下方"构建部署"章节。

### 运行测试

```bash
npm test
```

## 加密开关

页面头部有一个加密状态按钮，实时显示当前加密状态：

```
🟢 已加密  — 加密正常工作
🟡 明文    — 用户手动关闭加密（点击可重新开启）
🔴 加密不可用 — Web Crypto API 不可用（非 HTTPS 非 localhost），灰色禁用
```

点击按钮可在"已加密"和"明文"之间切换。切换即时生效，不影响已完成的传输。

## 架构

### 整体架构

```
┌─────────────────┐                 ┌─────────────────┐                 ┌─────────────────┐
│   浏览器 A       │                 │   信令服务器      │                 │   浏览器 B       │
│                 │                 │                 │                 │                 │
│  Vue 3 SPA      │── WebSocket ───│  ws server      │─── WebSocket ───│  Vue 3 SPA      │
│                 │  房间/信令      │                 │  房间/信令      │                 │
│  WebRTC         │                 │  RoomManager    │                 │  WebRTC         │
│  DataChannel    │═══════════════ P2P 直连 ══════════════════════════│  DataChannel    │
│  ECDH + AES-GCM │    加密文件     │                 │    加密文件     │  ECDH + AES-GCM │
└─────────────────┘                 └─────────────────┘                 └─────────────────┘
```

**三层安全边界**：

```
  应用层: ECDH + AES-256-GCM（端到端，仅收发双方有密钥）
  传输层: DTLS-SRTP（WebRTC 自带，逐跳加密）
  信令层: 信令服务器零知识（公钥通过 DataChannel 直传，不经服务器）
```

### 数据可见性

| | 信令服务器 | TURN 中继 | 接收方 |
|------|----------|----------|--------|
| 房间号、设备名、文件大小 | ✓ | ✗ | ✓ |
| 客户端 IP | ✗ | ✓ | ✗ |
| 加密公钥 | ✗ | ✗ | ✓ |
| 文件内容 | ✗ | ✗ | ✓（解密后） |
| 密文数据 | ✗ | ✓（仅密文） | ✓ |

### 加密握手流程

```
A                                    B
  │  DataChannel 建立                  │
  │                                    │
  │  ──── crypto_handshake(pubA) ────→│  A 发送 ECDH 公钥
  │                                    │  B 生成密钥对
  │                                    │  B 推导共享密钥 → AES key
  │                                    │
  │  ←──── crypto_handshake(pubB) ────│  B 回复公钥
  │  A 推导共享密钥 → AES key          │
  │                                    │
  │  ===== 双方拥有相同 AES 密钥 ======  │
  │                                    │
  │  发送时: encrypt(chunk) → dc.send  │
  │  接收时: dc.onmessage → decrypt()  │
```

**密钥派生链**：

```
ECDH P-256 shared secret (256 bit)
        │
        ▼ HKDF-SHA-256(salt: empty, info: "filebeam-e2e")
AES-256-GCM key (256 bit)
```

**握手防竞态设计**：

- 双方 DataChannel 打开时同时发起握手，先到达的消息被处理
- 已拥有密钥对的一方收到对端消息时，直接推导而不重新生成密钥对，也不发送重复响应
- 握手消息无限循环已通过单元测试验证

### 传输流程

```
发送方                                  接收方
  │                                       │
  │  检查: DC open? crypto ready/off?     │
  │                                       │
  │  ① file_meta ──────────────────────→│  文件元信息（名称、大小、分片数）
  │                                       │
  │  ② 加密分片 (AES-256-GCM)            │
  │     [24B 头][chunk 数据]               │
  │       → AES-GCM encrypt              │
  │     [12B IV][密文 + 16B tag]          │
  │     chunk 0 ───────────────────────→│  → AES-GCM decrypt
  │     chunk 1 ───────────────────────→│  → 组装分片、更新进度
  │     ...                            │
  │     chunk N ───────────────────────→│
  │                                       │
  │  ③ transfer_complete ──────────────→│  所有分片发送完毕
  │                                       │
  │  ④ 接收 transfer_ack ←─────────────│  确认完成 → 进度归一化 100%
  │                                       │
  │  ⑤ 下载文件                          │  Blob → <a>.click()
```

### 数据帧格式

```
原始分片（加密前）：
┌──────────────────┬────────────────────────────┐
│   24 字节头部      │   Chunk 数据（可变长）       │
├────────┬─────────┼────────────────────────────┤
│ 0-15   │ 16-19   │ 20-23     │ 24+            │
│ fileId │ index   │ total     │ 文件二进制数据    │
│ (UTF-8)│ (uint32)│ (uint32)  │                 │
└────────┴─────────┴───────────┴─────────────────┘

加密后（通过 DataChannel 传输）：
┌───────────────┬──────────────────────────────────┐
│   12 字节 IV   │   AES-GCM 密文（含 16 字节 tag）   │
└───────────────┴──────────────────────────────────┘
```

### 前端架构

```
composables/
├── useApp.ts          # 核心调度器：信令 + WebRTC + E2E 加密 + 文件传输
├── useSignaling.ts    # WebSocket 信令封装
├── useUserProfile.ts  # 随机中文名 + 头像颜色
└── injectApp.ts       # 依赖注入

services/
├── SignalingService.ts    # WebSocket 客户端（自动重连）
├── WebRTCService.ts       # RTCPeerConnection + DataChannel 管理
├── CryptoService.ts       # ECDH 密钥协商 + AES-256-GCM 加解密
├── ConnectionDetector.ts  # LAN/TURN 检测（getStats）
├── FileChunker.ts         # 文件分片 + 二进制编码
└── FileAssembler.ts       # 分片收集 + Blob 组装

stores/
├── roomStore.ts       # 房间号、设备列表、连接状态
└── transferStore.ts   # 传输列表、进度、状态
```

## 信令协议

### 客户端 → 服务端（WebSocket JSON）

| type | 说明 | 携带字段 |
|------|------|----------|
| `create_room` | 创建房间 | `displayName`, `avatarColor` |
| `join_room` | 加入房间 | `roomCode`, `displayName`, `avatarColor` |
| `leave_room` | 离开房间 | — |
| `sdp_offer` | WebRTC Offer | `target`, `sdp` |
| `sdp_answer` | WebRTC Answer | `target`, `sdp` |
| `ice_candidate` | ICE 候选 | `target`, `candidate` |
| `connection_mode` | 连接模式通知 | `target`, `mode` |

### 服务端 → 客户端

| type | 说明 | 携带字段 |
|------|------|----------|
| `room_created` | 房间创建成功 | `roomCode`, `peerId`, `peerName`, `avatarColor` |
| `room_joined` | 加入成功 | `roomCode`, `peerId`, `peers[]` |
| `room_error` | 错误 | `code`, `message` |
| `peer_joined` | 新设备加入 | `peerId`, `displayName`, `avatarColor` |
| `peer_left` | 设备离开 | `peerId` |

### 端到端消息（DataChannel，不经服务器）

| type | 编码 | 加密 | 说明 |
|------|------|------|------|
| `crypto_handshake` | JSON | 否 | ECDH 公钥交换 |
| `file_meta` | JSON | 否 | 文件元信息 |
| chunk | 二进制 | **是** | 加密的文件分片 |
| `transfer_complete` | JSON | 否 | 分片发送完毕 |
| `transfer_ack` | JSON | 否 | 确认接收完成 |
| `transfer_pause` | JSON | 否 | 暂停传输 |
| `transfer_resume` | JSON | 否 | 恢复传输 |
| `transfer_cancel` | JSON | 否 | 取消传输 |
| `transfer_ready` | JSON | 否 | 接收方就绪 |

## TURN 服务器搭建指南

局域网内 WebRTC 可 LAN 直连。跨网络（不同 WiFi、移动网络、防火墙后）需要 TURN 中继。**即使走 TURN 中继，端到端加密确保 TURN 服务器无法解密文件内容。**

### Coturn 安装

```bash
# Ubuntu/Debian
sudo apt install coturn

# Docker
docker run -d --network=host coturn/coturn
```

### 配置

编辑 `/etc/turnserver.conf`：

```conf
listening-port=3478
external-ip=你的公网IP
user=username:password
realm=yourdomain.com
lt-cred-mech
verbose
no-multicast-peers
```

### 启动

```bash
sudo systemctl enable coturn
sudo systemctl start coturn
```

### 配置客户端

在 `.env` 中：

```env
VITE_ICE_SERVERS=[
  {"urls":"stun:stun.l.google.com:19302"},
  {"urls":"turn:你的服务器IP:3478","username":"username","credential":"password"}
]
```

> Google STUN 仅适合测试，生产环境建议自建 STUN + TURN。

### 验证 TURN

用两个不同网络的设备（如手机用流量 + 电脑连 WiFi），加入同一房间，观察连接模式指示器是否显示"TURN 中继"（黄色）。

## Docker 部署

项目包含完整的 Docker Compose 配置，一键启动。

### 文件说明

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 编排 signaling + nginx 两个容器 |
| `server/Dockerfile` | 信令服务器镜像（Node.js + tsx） |
| `client/Dockerfile` | 前端镜像（多阶段：Vite 构建 → Nginx 服务） |
| `client/nginx.conf` | Nginx 配置（SPA + WebSocket 代理） |
| `.env.production` | 生产环境变量模板 |
| `.dockerignore` | 构建排除文件 |

### 容器架构

```
                    Docker 内部网络
┌──────────────────────────────────────────────┐
│                                              │
│   nginx (:7755)        signaling (:7766)     │
│   ┌──────────┐         ┌──────────────┐     │
│   │ / → dist │         │ ws server    │     │
│   │ /ws ────┼────proxy─→              │     │
│   └──────────┘         └──────────────┘     │
│        │                                     │
└────────┼─────────────────────────────────────┘
         │ 端口 ${APP_PORT}
         ▼
      用户浏览器
```

- 信令服务器不暴露端口到宿主机，仅 nginx 通过内部网络访问
- nginx 代理 `/ws` 路径到信令服务器的 WebSocket
- 前端生产构建时自动将信令地址设为 `wss://<当前域名>/ws`

### 部署步骤

**1. 配置环境变量**

```bash
cp .env.production .env
```

编辑 `.env`：

```env
# 对外访问端口（与现有服务不冲突即可）
APP_PORT=7755

# STUN/TURN 服务器（修改为你的 TURN 信息）
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

**2. 启动**

```bash
docker compose up -d
```

**3. 验证**

```bash
docker compose ps
# 两个容器都应该 Up
```

浏览器访问 `http://你的服务器IP:7755`。

**4. 查看日志**

```bash
docker compose logs -f
```

**5. 更新**

```bash
git pull
docker compose build
docker compose up -d
```

### 配置 HTTPS（强烈推荐）

加密和剪贴板复制依赖安全上下文。在 Nginx 前加一层反向代理（如 Nginx Proxy Manager、Caddy、Traefik），或修改 `client/nginx.conf` 直接配置 SSL。

**Caddy 示例**（自动 HTTPS）：

```caddy
filebeam.yourdomain.com {
    reverse_proxy localhost:7755
}
```

### 端口整合

你已有 `new-api` 占用 `52000`，FileBeam 默认用 `7755`，不冲突。如需改端口，修改 `.env` 中 `APP_PORT` 后重新启动：

```bash
docker compose down
# 编辑 .env → APP_PORT=其他端口
docker compose up -d
```

## 项目结构

```
p2p-filebeam/
├── package.json              # 根 workspace 配置
├── tsconfig.base.json        # 共享 TypeScript 配置
├── .env.example              # 环境变量示例
├── README.md
├── FLOW.md                   # 完整执行流程图
│
├── client/                   # Vue 3 前端
│   └── src/
│       ├── main.ts
│       ├── App.vue / AppCore.vue
│       ├── router/           # Hash 路由
│       ├── views/            # HomeView, RoomView, TransferView
│       ├── components/       # ConnectionBadge
│       ├── composables/      # useApp, useSignaling, useUserProfile, injectApp
│       ├── stores/           # roomStore, transferStore
│       ├── services/         # SignalingService, WebRTCService, CryptoService,
│       │                     # ConnectionDetector, FileChunker, FileAssembler
│       ├── types/            # signaling, transfer, room, webrtc
│       └── utils/            # format, id, validation
│
└── server/                   # Node.js 信令服务器
    └── src/
        ├── index.ts
        ├── SignalingServer.ts   # WebSocket + Peer 生命周期
        ├── RoomManager.ts       # 房间 CRUD + 过期清理
        ├── MessageHandler.ts    # 消息路由
        └── types.ts
```

## 限制

- 单文件最大 2GB（浏览器 Blob 限制）
- 每房间最多 10 个设备
- 房间无活动 1 小时后自动过期
- 加密需 HTTPS 或 localhost 环境（非安全上下文自动降级为明文传输）
- 加密保护文件分片内容，`file_meta`（文件名、大小）为明文
- iOS Safari 对 WebRTC 支持有限，大文件传输可能不稳定
- 后台标签页可能被浏览器限制传输速率
