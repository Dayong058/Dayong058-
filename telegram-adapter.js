// telegram-adapter.js - Telegram WebApp 适配器
// 版本: 20241025

// ====================== Telegram WebApp 全局适配器 ======================
const TelegramAdapter = (function () {
  "use strict";

  // Telegram WebApp 实例
  let tg = null;
  let isTelegramEnv = false;
  let isExpanded = false;

  // 初始化
  function init() {
    // 检查是否在 Telegram WebApp 环境中
    if (typeof window.Telegram !== "undefined" && window.Telegram.WebApp) {
      tg = window.Telegram.WebApp;
      isTelegramEnv = true;

      console.log("✅ Telegram WebApp 环境检测成功");
      console.log("- WebApp版本:", tg.version);
      console.log("- 平台:", tg.platform);
      console.log("- 主题:", tg.colorScheme);
      console.log("- 语言:", tg.initParams || tg.initData);

      // 应用 Telegram 主题
      applyTelegramTheme();

      // 扩展 WebApp 到全屏（推荐）
      expandWebApp();

      // 设置背景颜色
      setBackgroundColor();

      // 准备完成
      tg.ready();

      // 绑定关闭事件
      setupCloseHandler();

      return true;
    } else {
      console.log("ℹ️ 非 Telegram 环境，使用标准 Web 模式");
      isTelegramEnv = false;
      return false;
    }
  }

  // 应用 Telegram 主题
  function applyThemeClasses() {
    if (!tg) return;

    const isDark = tg.colorScheme === "dark";
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light",
    );
    document.body.classList.toggle("tg-dark", isDark);
    document.body.classList.toggle("tg-light", !isDark);
  }

  function applyTelegramTheme() {
    if (!tg) return;

    // 根据 Telegram 主题设置页面主题
    applyThemeClasses();

    // 监听主题变化
    tg.onEvent("themeChanged", function () {
      applyThemeClasses();
    });
  }

  // 扩展 WebApp 到全屏
  function expandWebApp() {
    if (!tg || isExpanded) return;

    try {
      tg.expand();
      isExpanded = true;
      console.log("✅ WebApp 已扩展");
    } catch (error) {
      console.warn("⚠️ 扩展 WebApp 失败:", error);
    }
  }

  // 设置背景颜色
  function isVersionAtLeast(current, target) {
    const a = String(current || "0")
      .split(".")
      .map((x) => parseInt(x, 10) || 0);
    const b = String(target || "0")
      .split(".")
      .map((x) => parseInt(x, 10) || 0);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av > bv) return true;
      if (av < bv) return false;
    }
    return true;
  }

  function setBackgroundColor() {
    if (!tg) return;
    // Telegram WebApp 6.0 不支持 setBackgroundColor，低版本静默跳过。
    if (!isVersionAtLeast(tg.version, "6.1")) return;

    // 获取当前主题对应的背景色
    const backgroundColor = tg.colorScheme === "dark" ? "#1a1a1a" : "#ffffff";

    try {
      tg.setBackgroundColor(backgroundColor);
      console.log("✅ 背景颜色已设置", backgroundColor);
    } catch (error) {
      console.warn("⚠️ 设置背景颜色失败:", error);
    }
  }

  // 设置头部颜色
  function setHeaderColor(color) {
    if (!tg) return;

    try {
      tg.setHeaderColor(color);
      console.log("✅ 头部颜色已设置", color);
    } catch (error) {
      console.warn("⚠️ 设置头部颜色失败:", error);
    }
  }

  // 设置关闭处理器
  function setupCloseHandler() {
    if (!tg) return;

    // Telegram 的关闭按钮
    tg.onEvent("backButtonClicked", function () {
      if (confirm("确定要离开应用吗？")) {
        tg.close();
      }
    });

    // 如果支持主按钮，设置关闭功能
    if (tg.MainButton) {
      // 可以配置主按钮用于重要操作
    }
  }

  // 打开链接（Telegram 环境使用 tg.openLink，否则用标准方式）
  function openInPage(url) {
    if (typeof window.openUrl === "function") window.openUrl(url, "_self");
    else window.location.href = url;
  }

  function openLink(url, options = {}) {
    if (!url) return;

    // 处理相对路径
    if (url.startsWith("/")) {
      // 如果是内部链接，优先走站内路由
      openInPage(url);
      return;
    }

    // 外部链接处理
    if (isTelegramEnv && tg && tg.openLink) {
      try {
        tg.openLink(url, options);
        console.log("🔗 通过 Telegram 打开链接:", url);
      } catch (error) {
        console.warn("⚠️ Telegram 打开链接失败，使用标准方式:", error);
        openInPage(url);
      }
    } else {
      // 标准浏览器环境
      openInPage(url);
    }
  }

  // 显示确认对话框
  function showConfirm(message, callback) {
    const safeCallback = typeof callback === "function" ? callback : () => {};
    if (isTelegramEnv && tg && tg.showConfirm) {
      try {
        tg.showConfirm(message, safeCallback);
      } catch (error) {
        // 降级处理
        if (confirm(message)) {
          safeCallback(true);
        } else {
          safeCallback(false);
        }
      }
    } else {
      const result = confirm(message);
      safeCallback(result);
    }
  }

  // 显示警告
  function showAlert(message, callback) {
    const safeCallback = typeof callback === "function" ? callback : () => {};
    if (isTelegramEnv && tg && tg.showAlert) {
      try {
        tg.showAlert(message, safeCallback);
      } catch (error) {
        alert(message);
        safeCallback();
      }
    } else {
      alert(message);
      safeCallback();
    }
  }

  // 显示弹窗
  function showPopup(params, callback) {
    const safeCallback = typeof callback === "function" ? callback : () => {};
    if (isTelegramEnv && tg && tg.showPopup) {
      try {
        tg.showPopup(params, safeCallback);
      } catch (error) {
        console.warn("⚠️ Telegram 弹窗失败:", error);
        // 降级处理
        if (params.message) {
          alert(params.message);
          safeCallback();
        }
      }
    } else {
      if (params.message) {
        alert(params.message);
        safeCallback();
      }
    }
  }

  // 获取用户数据
  function getUserData() {
    if (!tg) return null;

    try {
      // 尝试从不同位置获取用户数据
      const initData = tg.initData || tg.initDataUnsafe || {};
      const user = initData.user || tg.initParams?.user || null;

      if (user) {
        return {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          username: user.username,
          languageCode: user.language_code,
          photoUrl: user.photo_url,
          isPremium: user.is_premium || false,
        };
      }

      return null;
    } catch (error) {
      console.warn("⚠️ 获取用户数据失败:", error);
      return null;
    }
  }

  // 获取启动参数
  function getStartParam() {
    if (!tg) return "";

    try {
      return (
        tg.initDataUnsafe?.start_param ||
        tg.initParams?.start_param ||
        tg.startParam ||
        ""
      );
    } catch (error) {
      console.warn("⚠️ 获取启动参数失败:", error);
      return "";
    }
  }

  // 发送数据到后端
  function getWriteAuthHeaders() {
    const token = String(
      window["__WRITE_API_TOKEN__"] ||
        localStorage.getItem("WRITE_API_TOKEN") ||
        "",
    ).trim();
    if (!token) return {};
    return {
      "x-api-key": token,
      Authorization: `Bearer ${token}`,
    };
  }

  function sendData(data, endpoint = "/api/telegram-data") {
    if (!data) return Promise.reject("没有数据");

    // 添加 Telegram 环境信息
    const payload = {
      ...data,
      _telegramEnv: isTelegramEnv,
      _platform: tg?.platform || "web",
      _timestamp: Date.now(),
    };

    // 如果有用户数据，添加到 payload
    const userData = getUserData();
    if (userData) {
      payload.user = userData;
    }

    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getWriteAuthHeaders(),
      },
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .catch((error) => {
        console.error("发送数据失败", error);
        throw error;
      });
  }

  // 持久化用户数据到后端
  function persistUserData() {
    const userData = getUserData();
    const startParam = getStartParam();

    if (userData && userData.id) {
      return sendData(
        {
          telegramId: userData.id,
          source: startParam,
          action: "user_persist",
        },
        "/api/user/persist",
      );
    }

    return Promise.resolve({ success: false, reason: "no_user_data" });
  }

  // 触发触觉反馈
  function hapticFeedback(type = "impact", style = "light") {
    if (!tg || !tg.HapticFeedback) return;

    try {
      const haptic = tg.HapticFeedback;

      switch (type) {
        case "impact":
          haptic.impactOccurred(style);
          break;
        case "notification":
          haptic.notificationOccurred(style);
          break;
        case "selection":
          haptic.selectionChanged();
          break;
        default:
          haptic.impactOccurred("light");
      }
    } catch (error) {
      console.warn("⚠️ 触觉反馈失败:", error);
    }
  }

  // 获取当前主题
  function getTheme() {
    if (!tg) return "light";
    return tg.colorScheme || "light";
  }

  // 订阅事件
  function onEvent(eventName, callback) {
    if (!tg) return;

    try {
      tg.onEvent(eventName, callback);
    } catch (error) {
      console.warn(`⚠️ 订阅事件 ${eventName} 失败:`, error);
    }
  }

  // 获取启动参数（兼容旧版本）
  function getLaunchParams() {
    return getStartParam();
  }

  // 检查是否可见
  function isVisible() {
    if (!tg) return true;
    return tg.isVisible !== false;
  }

  // 请求全屏
  function requestFullscreen() {
    expandWebApp();
  }

  // 关闭 WebApp
  function close() {
    if (!tg) return;

    try {
      tg.close();
    } catch (error) {
      console.warn("⚠️ 关闭 WebApp 失败:", error);
    }
  }

  // 公共 API
  return {
    // 初始化
    init,

    // 状态
    isTelegramEnv: () => isTelegramEnv,
    getInstance: () => tg,
    getTheme,
    isVisible,

    // 用户数据
    getUserData,
    getStartParam,
    getLaunchParams,

    // 交互
    openLink,
    showConfirm,
    showAlert,
    showPopup,
    hapticFeedback,
    close,
    requestFullscreen,

    // 数据操作
    persistUserData,
    sendData,

    // 事件
    onEvent,

    // 样式
    setHeaderColor,
    setBackgroundColor,
  };
})();

// 立即初始化
TelegramAdapter.init();

// 全局暴露
window.TelegramAdapter = TelegramAdapter;
window.TG = TelegramAdapter; // 简写
