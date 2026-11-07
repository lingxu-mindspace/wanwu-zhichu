# UE5 原型启动计划 — 从验证到制作的第一步

> 目标：2周内完成可交互的部位伤害战斗原型

---

## 一、原型目标

最小化战斗场景：两个角色、武器挥砍→部位碰撞检测→命中反馈、服务端权威判定、网络延迟模拟。

**不是目标**：美术成品、大地图、多人在线。

---

## 二、技术架构

```
UE5 Client → 输入/本地预测 → Server(权威碰撞检测) → 命中结果 → 双方Client
```

| 决策 | 选择 | 理由 |
|------|------|------|
| 碰撞检测位置 | 服务端 | 已验证架构 |
| 物理引擎 | Chaos Physics | UE5内置 |
| 网络传输 | Replication (UDP) | 内置 |
| 部位模型 | 骨骼网格+物理资产 | per-bone collision |
| 武器碰撞 | 物理资产碰撞体+Sweep | Chaos支持 |

---

## 三、两周工作分解

### 第1周：基础搭建

| 天 | 任务 | 验收标准 |
|----|------|---------|
| 1 | 创建UE5项目(C++/BP)，设置DS目标 | 编译通过 |
| 2 | 简易角色模型，设置骨骼 | 场景中可移动 |
| 3 | 物理资产：6部位胶囊体碰撞 | 碰撞体可视化正确 |
| 4 | 基础网络：两客户端连同一Server | 双方同步 |
| 5 | 武器挥砍：动画+碰撞体轨迹 | Debug Draw可见 |

### 第2周：部位判定+延迟测试

| 天 | 任务 |
|----|------|
| 6 | 服务端部位碰撞检测 |
| 7 | 命中反馈（高亮+伤害数字） |
| 8 | 护甲系统（头盔/胸甲减免） |
| 9 | 网络延迟模拟(PktLag=0/50/150/300) |
| 10 | UE5 Automation Test，复现Node.js测试矩阵 |

---

## 四、物理资产设置

在 SK_Mannequin 上创建 Query Only 碰撞体：

| 部位 | 类型 | 大小 [D] |
|------|------|------|
| 头 | Sphere | R=12cm |
| 躯干 | Capsule | H=50 R=20 |
| 上臂 | Capsule | H=28 R=6 |
| 前臂 | Capsule | H=25 R=5 |
| 大腿 | Capsule | H=38 R=8 |
| 小腿 | Capsule | H=35 R=7 |

---

## 五、核心 C++ 类

```cpp
UENUM()
enum class EBodyPart : uint8 {
    Head, Torso,
    LeftUpperArm, LeftForearm, RightUpperArm, RightForearm,
    LeftUpperLeg, LeftLowerLeg, RightUpperLeg, RightLowerLeg
};

USTRUCT()
struct FHitResult_BodyPart {
    UPROPERTY() EBodyPart Part;
    UPROPERTY() FVector HitLocation;
    UPROPERTY() float RawDamage;
    UPROPERTY() float FinalDamage;
};

USTRUCT()
struct FAttackMessage {
    UPROPERTY() FVector WeaponStart_Start, WeaponStart_End;
    UPROPERTY() FVector WeaponEnd_Start, WeaponEnd_End;
    UPROPERTY() float WeaponThickness;
    UPROPERTY() float BaseDamage;
    UPROPERTY() int64 ClientTimestamp;
};
```

---

## 六、预期风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| Chaos swept collision API不熟 | 中 | 手动substep sampling（同Node.js方案） |
| 物理资产设置复杂 | 中 | 先用简化胶囊体 |
| C++编译慢 | 高 | 关键逻辑先BP原型 |

---

> 版本：1.0 | 状态：待UE5项目创建和团队分配
