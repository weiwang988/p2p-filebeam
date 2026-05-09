# FileBeam 完整执行流程

从访问首页到文件传输完成的端到端流程，覆盖 WebSocket 信令、WebRTC 握手、端到端加密握手（含手动开关和降级逻辑）、STUN/TURN 作用时机、分片传输、下载。

---

## 阶段 1：页面加载 & 信令连接

```
用户访问 http://192.168.1.5:3000
        │
        ▼
  Vue 应用初始化 (main.ts)
  创建 Pinia → 创建 Router → 挂载 App
        │
        ▼
  AppCore.vue 渲染 HomeView
  useApp() 被调用
        │
        ▼
  cryptoAvailable = !!window.crypto?.subtle
    ├── http://localhost:3000       → true  (localhost 是安全上下文)
    ├── https://192.168.1.5:3000   → true  (HTTPS)
    └── http://192.168.1.5:3000    → false (非安全上下文!)

  encryptionEnabled = ref(cryptoAvailable)
        │
        ▼
  getSignalingUrl() 自动推断：
  window.location.hostname = "192.168.1.5"
  → 返回 "ws://192.168.1.5:3001"
        │
        ▼
  new SignalingService("ws://192.168.1.5:3001")
  new WebSocket("ws://192.168.1.5:3001")
        │
        ▼
  ┌────────── WebSocket 连接成功 ──────────┐
  │ 双方可随时收发 JSON 消息                 │
  │ 断开自动重连                            │
  └────────────────────────────────────────┘
        │
        ▼
  生成随机身份：useUserProfile()
  用户名："勇敢的极客"
  头像色：hsl(42, 65%, 55%)
```

---

## 阶段 2：创建房间（用户 A）

```
用户 A 点击 "创建房间"
        │
        ▼
  signaling.send({
    type: "create_room",
    displayName: "勇敢的极客",
    avatarColor: "hsl(42,65%,55%)"
  })
        │
        ▼  (WebSocket → 信令服务器)
        │
  ┌─────────────────────────────────────┐
  │ 服务端 MessageHandler               │
  │   RoomManager.createRoom()          │
  │   生成 6 位随机房间号 如 "A3F8K2"    │
  │   创建 Room 对象，加入 peer          │
  └─────────────────────────────────────┘
        │
        ▼  (WebSocket ← 信令服务器)
        │
  signaling.onMessage → type: "room_created"
  roomStore.setRoom("A3F8K2", "peer42_abc")
  router.push("/room/A3F8K2")
        │
        ▼
  RoomView 渲染：
  ┌────────────────────────────────────────────────┐
  │  ← 离开   房间号 A3F8K2  [复制]    [已加密]    │
  │  ┌────────┐  ┌──────────────────────────────┐ │
  │  │ 设备 1  │  │  拖放文件到此处                │ │
  │  │ ● 勇敢… │  │  [选择文件]                   │ │
  │  └────────┘  └──────────────────────────────┘ │
  └────────────────────────────────────────────────┘

  头部 [已加密] badge: 绿色，可点击切换
  （若 cryptoAvailable=false 则显示红色 [加密不可用]）
```

---

## 阶段 3：加入房间（用户 B）

```
用户 B 输入 "A3F8K2" → 点击 "加入房间"
        │
        ▼
  signaling.send({
    type: "join_room",
    roomCode: "A3F8K2",
    displayName: "好奇的开发者",
    avatarColor: "hsl(180,65%,55%)"
  })
        │
        ▼  (WebSocket → 信令服务器)
        │
  ┌─────────────────────────────────────┐
  │ 服务端 MessageHandler               │
  │   验证 roomCode 格式 ✓              │
  │   RoomManager.joinRoom()            │
  │   房间存在 ✓  未满员 ✓              │
  │   peer 加入房间                      │
  │                                     │
  │   ① 回复 B: room_joined             │
  │     (包含已有 peer 列表)             │
  │                                     │
  │   ② 广播给 A: peer_joined           │
  └─────────────────────────────────────┘
        │
        ▼  (两条消息)
        │
  B 收到 room_joined:                  A 收到 peer_joined:
  roomStore.setRoom()                  roomStore.addPeer({
  router.push("/room/A3F8K2")            id: "peer99_xyz",
                                         displayName: "好奇的开发者",
  A 出现在 B 的设备列表中                 avatarColor: "hsl(180,65%,55%)",
  B 看到已有 A 在房间                    connectionMode: "unknown"
                                       })
                                       initiateWebRTC("peer99_xyz")
```

---

## 阶段 4：WebRTC 握手 & ICE 候选收集

**STUN 在这里第一次起作用。**

```
A: initiateWebRTC("peer99_xyz")
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ new RTCPeerConnection({                                   │
│   iceServers: [                                           │
│     { urls: "stun:stun.l.google.com:19302" }  ← STUN     │
│   ]                                                       │
│ })                                                        │
└───────────────────────────────────────────────────────────┘
        │
        ▼
  createDataChannel("filebeam")  ← A 创建数据通道
        │
        ▼
  createOffer() → 生成 SDP → setLocalDescription()
        │
        ▼
  ┌──── ICE 候选收集开始（浏览器自动执行）────┐
  │                                            │
  │  浏览器向 STUN 服务器发请求                 │
  │  stun.l.google.com:19302                   │
  │                                            │
  │  返回结果：                                 │
  │  ┌──────────────────────────────────────┐ │
  │  │ host 候选：                           │ │
  │  │   192.168.1.5:54321 (内网地址)         │ │
  │  │                                      │ │
  │  │ srflx 候选（通过 STUN 获得）：         │ │
  │  │   203.0.113.42:54321 (公网地址)        │ │
  │  │                                      │ │
  │  │ relay 候选（TURN 中继）：              │ │
  │  │   只有配置了 TURN 服务器才会出现        │ │
  │  └──────────────────────────────────────┘ │
  │                                            │
  └────────────────────────────────────────────┘
        │
        ▼
  每个 ICE 候选 → onIceCandidate 回调
  signaling.send({ type: "ice_candidate", target: "peer99_xyz", candidate })
        │
        ▼  SDP Offer
  signaling.send({ type: "sdp_offer", target: "peer99_xyz", sdp })
```

```
B 收到 sdp_offer:
        │
        ▼
  handleSdpOffer("peer42_abc", sdp)
  new RTCPeerConnection({ iceServers: [...] })
  setRemoteDescription(sdp)
  createAnswer() → setLocalDescription()
  → pc.ondatachannel 触发（接收 A 创建的 DataChannel）
        │
        ▼
  ┌──── B 的 ICE 候选收集 ────┐
  │  host:   192.168.1.8:12345 │
  │  srflx:  203.0.113.99:...  │
  └────────────────────────────┘
        │
        ▼
  signaling.send({ type: "sdp_answer", target: "peer42_abc", sdp })
  signaling.send({ type: "ice_candidate", ... })  ← 逐个候选
```

```
双方 ICE 候选交换后，浏览器连通性检查：

┌─────────────────────────────────────────────────────────────┐
│  同一 WiFi（同子网 192.168.1.x）：                           │
│    host ↔ host: 192.168.1.5:54321 ↔ 192.168.1.8:12345      │
│    直接连通 → LAN 直连 🟢                                    │
│                                                             │
│  ─────────────────────────────────────────                  │
│                                                             │
│  不同网络（跨 NAT）：                                        │
│    host ↔ host: 不通（不同内网）                             │
│    srflx ↔ srflx: 尝试公网直连 → 视 NAT 类型而定             │
│      锥形 NAT → 可能成功                                     │
│      对称 NAT → 失败 → 检查 relay 候选：                     │
│        ├── 有 TURN → relay 候选 → TURN 中继 🟡              │
│        └── 无 TURN → 连接失败 "连接中..."                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 阶段 5：连接建立 & 模式检测

```
DataChannel 状态变为 "open"（双方各自触发）
        │
        ▼
  onDataChannelOpen("peer99_xyz")
  store.updatePeerConnection("peer99_xyz", {
    connectionState: "connected"
  })
        │
        ├── startCryptoHandshake("peer99_xyz")
        │   ┌────────────────────────────────────┐
        │   │ if (!encryptionEnabled.value)       │
        │   │   return  ← 加密已关闭，跳过握手     │
        │   │                                    │
        │   │ if (cryptoServices.has(peerId))     │
        │   │   return  ← 已有握手进行中           │
        │   │                                    │
        │   │ const cs = new CryptoService()      │
        │   │ await cs.generateKeyPair()          │
        │   │ cryptoServices.set(peerId, cs)      │
        │   │   ← 先生成密钥，再注册，防竞态       │
        │   │                                    │
        │   │ sendTo(peerId, crypto_handshake)    │
        │   └────────────────────────────────────┘
        │
        └── flushPendingFiles(peerId)
            ┌────────────────────────────────────┐
            │ DC open? ✓                         │
            │ encryptionEnabled?                  │
            │   false → 跳过 crypto 检查，直接刷出 │
            │   true → crypto ready?              │
            │     no → return（等待握手完成）      │
            │     yes → 刷出排队文件               │
            └────────────────────────────────────┘
        │
        ▼
  ConnectionDetector（getStats 分析）
        ├── relay 候选 → connectionMode = "turn"
        └── host/srflx → connectionMode = "lan"
        │
        ▼
  signaling.send({ type: "connection_mode", target, mode })

此时设备列表：
┌──────────────────────────────────────┐
│ 设备 2                               │
│ ┌──────────────────────────────────┐ │
│ │ ● 勇敢的极客  自己               │ │
│ │   本机                           │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ● 好奇的开发者  🟢              │ │
│ │   局域网直连                      │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

## 阶段 6：端到端加密握手

### 6.1 握手流程

**双方都可在 DataChannel 打开时发起握手。先到者处理，后到者不重复发送。**

```
A (先触发 onDataChannelOpen)               B (后触发 onDataChannelOpen)
  │                                         │
  │  startCryptoHandshake()                  │
  │  ① cs = new CryptoService()              │
  │  ② pubKeyA = await generateKeyPair()    │
  │     (crypto.subtle ECDH P-256)          │
  │  ③ cryptoServices.set(peerId, cs)       │
  │     ← 生成完毕后才注册，窗口期状态安全    │
  │  ④ sendTo(crypto_handshake, pubKeyA)    │
  │                                         │
  │── crypto_handshake(pubKeyA) ──────────→│  startCryptoHandshake()
  │                                         │  ① cs = new CryptoService()
  │                                         │  ② pubKeyB = await generateKeyPair()
  │                                         │  ③ cryptoServices.set(peerId, cs)
  │                                         │  ④ sendTo(crypto_handshake, pubKeyB)
  │                                         │
  │                                         │  ←──── pubKeyB 同时发出 ────
  │                                         │
  │  handleCryptoHandshake:                  │  handleCryptoHandshake:
  │  ┌──────────────────────┐               │  ┌──────────────────────┐
  │  │ encryptionEnabled? ✓ │               │  │ encryptionEnabled? ✓ │
  │  │ importKey(pubKeyB)   │               │  │ importKey(pubKeyA)   │
  │  │ keyPair 已存在 →      │               │  │ keyPair 已存在 →      │
  │  │   isNewKeyPair=false │               │  │   isNewKeyPair=false │
  │  │ deriveBits(256)      │               │  │ deriveBits(256)      │
  │  │ HKDF → AES-256-GCM    │               │  │ HKDF → AES-256-GCM    │
  │  │ ready_ = true         │               │  │ ready_ = true         │
  │  │ return null ← 不发重复响应│            │  │ return null ← 不发重复响应│
  │  └──────────────────────┘               │  └──────────────────────┘
  │                                         │
  │  flushPendingFiles()                    │  flushPendingFiles()
  │                                         │
  │    双方拥有相同 AES-256-GCM 密钥!          │
```

### 6.2 竞态条件防护

**场景**：`startCryptoHandshake` 的 async 部分还没完成，`handleCryptoHandshake` 就被触发。

```
时间线：
  t0: onDataChannelOpen → startCryptoHandshake 开始（async，未 await）
  t1: 收到对端 crypto_handshake → handleCryptoHandshake 触发
      → cryptoServices.get(peerId) = undefined（密钥对还没生成完）
      → 创建新的 CryptoService → deriveFromPeer → 生成密钥对 → 推导 AES key → ready
  t2: startCryptoHandshake 的 generateKeyPair 完成
      → cryptoServices.has(peerId) = true（t1 创建的）
      → 不覆盖，不重复
      → sendTo(crypto_handshake) 发送公钥（对端已推导完毕 → 对端 deriveFromPeer 发现 keyPair 已存在 → 返回 null → 不发重复响应）

结果：双方都推导出正确的共享密钥，无无限循环 ✓
```

### 6.3 加密开关状态机

```
                    cryptoAvailable?
                   /              \
                 no                yes
                 │                  │
                 ▼                  ▼
          encryptionEnabled    encryptionEnabled
          = false              = true (默认)
          UI: 🔴 不可用          UI: 🟢 已加密
          点击: 无反应            点击: toggle()
                                    │
                                    ▼
                              encryptionEnabled
                              = false
                              UI: 🟡 明文
                              点击: toggle() → 回到 🟢
```

### 6.4 密钥派生链

```
ECDH P-256 shared secret (256 bit)
        │
        ▼  HKDF-SHA-256
        │  salt: (empty)
        │  info: "filebeam-e2e"
        ▼
AES-256-GCM key (256 bit, non-extractable)
```

---

## 阶段 7：文件传输

### 7.1 发送方

```
A 拖入文件 → 点击 "发送 1 个文件"
        │
        ▼
  sendFiles([file])
  → 遍历所有 peer，对每个 peer 调用 sendFileToPeer()
        │
        ▼
  sendFileToPeer() 检查：
    DataChannel open? ───────────────── 否 → queue，等待
    encryptionEnabled.value?
      ├── false → 跳过加密检查，直接发送
      └── true  → crypto ready?
                    ├── 否 → queue，等握手完成
                    └── 是 → 继续
        │
        ▼
  FileChunker.chunk(file, 64KB)
  文件: photo.jpg (150KB = 153600 bytes)
  → chunk 0: 0-65536       (64KB)
  → chunk 1: 65536-131072  (64KB)
  → chunk 2: 131072-153600 (22KB)
        │
        ▼
  transferStore.addTransfer({
    fileId: "f_abc123", fileName: "photo.jpg",
    fileSize: 153600, totalChunks: 3,
    direction: "send", peerId: "peer99_xyz",
    status: "transferring"
  })
        │
        ▼
  ① 发送 file_meta（JSON，不经加密）：
     { type: "file_meta", fileId, fileName, fileSize, totalChunks, chunkSize }
        │
        ▼
  ┌─────────────── 加密分片传输 ──────────────┐
  │                                            │
  │  ② 编码 + 加密 chunk 0：                   │
  │     [24B 头][64KB 数据]                    │
  │       → AES-256-GCM encrypt               │
  │     [12B IV][密文 + 16B tag]               │
  │     dc.send(encrypted)                     │
  │     sentBytes = 65536 → 进度 42%           │
  │                                            │
  │  ③ chunk 1 → 进度 85%                     │
  │                                            │
  │  ④ chunk 2（最后一片 22KB）→ 进度 100%     │
  │                                            │
  │  流量控制：                                  │
  │    dc.bufferedAmount > 512KB → 暂停         │
  │    bufferedamountlow 事件 → 恢复            │
  │                                            │
  │  加密仅在 encryptionEnabled 时执行           │
  │  cs = encryptionEnabled ? get() : undefined │
  │  toSend = cs ? encrypt(encoded) : encoded   │
  └────────────────────────────────────────────┘
        │
        ▼
  ⑤ transferStore.updateProgress(id, fileSize) → 归一化 100%
     transferStore.setStatus(id, "complete")
     发送 transfer_complete
```

### 7.2 接收方

```
B 接收端：
        │
        ▼
  ① 收到 file_meta → fileAssembler.addMeta()
     transferStore.addTransfer({
       direction: "receive",
       peerId: "peer42_abc",
       status: "transferring"
     })
        │
        ▼
  ② 收到加密 chunk：
     ┌──────────────────────────────────────┐
     │ cs = encryptionEnabled               │
     │   ? cryptoServices.get(peerId)       │
     │   : undefined                        │
     │                                      │
     │ decrypted = cs                       │
     │   ? cs.decrypt(buffer)    ← 解密     │
     │   : buffer                 ← 原文    │
     │                                      │
     │ decodeChunkHeader(decrypted)         │
     │ chunkData = decrypted.slice(24)      │
     │ fileAssembler.addChunk()             │
     └──────────────────────────────────────┘
     receivedBytesTracker 精确累加（非近似）
        │
  ③ 最后一片到达 → addChunk 返回 true
     fileAssembler.assemble() → Blob
     receivedFiles.set(fileId, blob)
     进度归一化到 fileSize
     transferStore.setStatus(id, "complete")
        │
        ▼
  ④ 发送 transfer_ack：
     { type: "transfer_ack", fileId, status: "ok" }
```

### 7.3 数据帧格式

```
原始分片（encodeChunk 输出）：
┌──────────────────┬────────────────────────────┐
│   24 字节头部      │   Chunk 数据（可变长）       │
├────────┬─────────┼────────────────────────────┤
│ 0-15   │ 16-19   │ 20-23     │ 24+            │
│ fileId │ index   │ total     │ 文件二进制数据    │
│ (UTF-8)│ (uint32)│ (uint32)  │                 │
└────────┴─────────┴───────────┴─────────────────┘

加密后（encryptionEnabled=true 时）：
┌───────────────┬──────────────────────────────────┐
│   12 字节 IV   │   AES-GCM 密文（含 16 字节 tag）   │
└───────────────┴──────────────────────────────────┘
每个分片增加 28 字节开销（几乎可忽略）

加密关闭时（encryptionEnabled=false）：
直接发送原始分片，与加密前行为一致
```

---

## 阶段 8：下载 & 离开

```
B 的传输卡片：
┌──────────────────────────────────────────┐
│ photo.jpg         150.0 KB     接收      │
│ ● 来自 勇敢的极客                        │
│ ████████████████████████ 100%           │
│ 已完成                  局域网直连        │
│ [下载文件]                               │
└──────────────────────────────────────────┘
        │
        ▼  点击 "下载文件"
  downloadReceivedFile()
  → URL.createObjectURL(blob)   ← Blob 已解密（或原始明文）
  → <a>.click() 触发浏览器下载
  → URL.revokeObjectURL() 释放内存
        │
        ▼
  A 点击 "离开" → leaveRoom()
  signaling.send({ type: "leave_room" })
  webrtc.disconnectAll()
  cryptoServices.clear()
  store.reset()
  router.push("/")
```

---

## STUN / TURN / DTLS / AES-GCM 作用时机

```
                    时间线
    ┌─── 连接建立 ───┬─── 加密握手 ───┬──── 数据传输 ────┐
    │                │                │                  │
    │ STUN/TURN      │ ECDH + AES-GCM │ 加密数据          │
    │ ICE 候选收集     │ 密钥协商        │                  │
    │                │                │                  │
    ▼                ▼                ▼                  ▼

RTCPeerConnection   加密握手完成       传输完成

  四层安全：
  ┌─────────────────────────────────────────────────┐
  │ 应用层 E2E:  AES-256-GCM（本项目的加密）          │
  │   密钥: ECDH P-256 协商，不经服务器                │
  │   保护: 文件分片内容                               │
  │   降级: crypto.subtle 不可用时自动跳过              │
  │                                                 │
  │ 传输层:      DTLS-SRTP（WebRTC 自带）             │
  │   保护: DataChannel 所有流量不被网络窃听            │
  │                                                 │
  │ 中继层:      TURN credential（若走中继）           │
  │   保护: 仅授权客户端可使用 TURN                    │
  │   限制: TURN 只看得到 AES 密文，无法解密            │
  │                                                 │
  │ 信令层:      公钥通过 DataChannel 直传             │
  │   服务器看不到公钥，无法计算共享密钥                │
  └─────────────────────────────────────────────────┘

  STUN: 仅用于获取公网 IP（几个 UDP 包），不参与数据传输
  TURN: host/srflx 连不通时中继，消耗服务器带宽
```

---

## 消息协议总表

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

| type | 编码 | 加密 | 受加密开关控制 | 说明 |
|------|------|------|--------------|------|
| `crypto_handshake` | JSON | 否 | 关闭时忽略 | ECDH 公钥交换（base64） |
| `file_meta` | JSON | 否 | 否 | 文件元信息 |
| chunk | 二进制 | **是** | **是** | 加密的文件分片 |
| `transfer_complete` | JSON | 否 | 否 | 分片发送完毕 |
| `transfer_ack` | JSON | 否 | 否 | 确认接收完成 |
| `transfer_pause` | JSON | 否 | 否 | 暂停传输 |
| `transfer_resume` | JSON | 否 | 否 | 恢复传输 |
| `transfer_cancel` | JSON | 否 | 否 | 取消传输 |
| `transfer_ready` | JSON | 否 | 否 | 接收方就绪 |
