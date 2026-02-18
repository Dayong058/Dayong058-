// signin-coupon.js - 签到优惠券模块
console.log("🎫 签到优惠券模块加载");

// 定义签到模块
window.SigninCouponModule = {
  init: function (tg) {
    console.log("签到模块初始化开始");

    // 初始化签到按钮
    this.initSigninButton();

    // 初始化统计数据
    this.initStats();

    // 初始化优惠券提示
    this.initCouponTooltips();

    console.log("签到模块初始化完成");
  },

  initSigninButton: function () {
    const signinBtn = document.querySelector(".signin-btn");
    if (!signinBtn) return;

    // 检查今天是否已签到
    const today = new Date().toDateString();
    const lastSignin = localStorage.getItem("lastSigninDate");

    if (lastSignin === today) {
      // 已签到
      signinBtn.innerHTML = '<span class="checked-icon">✓</span> 已签到';
      signinBtn.style.backgroundColor = "#28a745";
      signinBtn.disabled = true;
    }

    // 绑定点击事件
    signinBtn.addEventListener("click", this.handleSignin.bind(this));
  },

  handleSignin: function (e) {
    e.preventDefault();
    const btn = e.target;

    // 防止重复点击
    if (btn.disabled) return;

    // 禁用按钮
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> 签到中...';
    btn.style.backgroundColor = "#ccc";
    btn.style.cursor = "not-allowed";

    // 模拟签到过程
    setTimeout(() => {
      // 签到成功
      const today = new Date().toDateString();
      localStorage.setItem("lastSigninDate", today);

      // 随机奖励
      const rewards = [
        { type: "积分", amount: Math.floor(Math.random() * 10) + 1 },
        { type: "优惠券", amount: Math.floor(Math.random() * 3) + 1 },
        { type: "金币", amount: Math.floor(Math.random() * 50) + 10 },
      ];

      const reward = rewards[Math.floor(Math.random() * rewards.length)];

      // 更新按钮状态
      btn.innerHTML = '<span class="checked-icon">✓</span> 已签到';
      btn.style.backgroundColor = "#28a745";
      btn.style.cursor = "default";

      // 更新优惠券数量
      const couponElement = document.getElementById("statCoupon");
      if (couponElement) {
        const current =
          parseInt(couponElement.textContent.replace(/,/g, "")) || 0;
        couponElement.textContent = (
          current + (reward.type === "优惠券" ? reward.amount : 0)
        ).toLocaleString();
        couponElement.classList.add("flash");
        setTimeout(() => couponElement.classList.remove("flash"), 500);
      }

      // 显示成功消息
      if (window.showToast) {
        window.showToast(
          `签到成功！获得${reward.amount}${reward.type}`,
          "success",
        );
      } else {
        alert(`签到成功！获得${reward.amount}${reward.type}`);
      }

      // 更新访问量
      const visitElement = document.getElementById("statVisit");
      if (visitElement) {
        const current =
          parseInt(visitElement.textContent.replace(/,/g, "")) || 0;
        visitElement.textContent = (current + 1).toLocaleString();
      }

      // 更新签到消息
      const signinMsg = document.getElementById("signinMsg");
      if (signinMsg) {
        signinMsg.innerHTML = `签到成功！获得${reward.amount}${reward.type}`;
        signinMsg.style.color = "#52c41a";
        signinMsg.className = "signin-message success";

        // 5秒后清除消息
        setTimeout(() => {
          signinMsg.innerHTML = "";
          signinMsg.className = "signin-message";
        }, 5000);
      }

      // 更新连续签到天数
      const streak = parseInt(localStorage.getItem("signinStreak") || "0");
      localStorage.setItem("signinStreak", (streak + 1).toString());
    }, 1000);
  },

  initStats: function () {
    // 设置默认统计数据
    const stats = {
      visits: 2168,
      views: 5092,
      coupons: 54,
    };

    // 从本地存储恢复
    const savedStats = localStorage.getItem("fangz_stats");
    if (savedStats) {
      try {
        const parsed = JSON.parse(savedStats);
        Object.assign(stats, parsed);
      } catch (e) {
        console.warn("解析统计数据失败", e);
      }
    }

    // 更新显示
    const visitElement = document.getElementById("statVisit");
    const viewElement = document.getElementById("statView");
    const couponElement = document.getElementById("statCoupon");

    if (visitElement) visitElement.textContent = stats.visits.toLocaleString();
    if (viewElement) viewElement.textContent = stats.views.toLocaleString();
    if (couponElement)
      couponElement.textContent = stats.coupons.toLocaleString();

    // 定期更新统计数据
    setInterval(() => {
      // 模拟数据增长
      stats.visits += Math.floor(Math.random() * 3);
      stats.views += Math.floor(Math.random() * 5);

      // 保存到本地存储
      localStorage.setItem("fangz_stats", JSON.stringify(stats));

      // 更新显示
      if (visitElement)
        visitElement.textContent = stats.visits.toLocaleString();
      if (viewElement) viewElement.textContent = stats.views.toLocaleString();
    }, 10000);
  },

  initCouponTooltips: function () {
    const couponTip = document.getElementById("couponTip");
    if (!couponTip) return;

    couponTip.addEventListener("click", function () {
      if (window.showToast) {
        window.showToast("今日可用优惠券数量，点击签到可获得更多", "info");
      } else {
        alert("今日可用优惠券数量，点击签到可获得更多");
      }
    });

    couponTip.addEventListener("mouseenter", function () {
      this.style.cursor = "help";
      this.title = "点击查看优惠券说明";
    });
  },

  // 其他方法
  getCouponCount: function () {
    const couponElement = document.getElementById("statCoupon");
    if (couponElement) {
      return parseInt(couponElement.textContent.replace(/,/g, "")) || 0;
    }
    return 0;
  },

  addCoupon: function (count) {
    const couponElement = document.getElementById("statCoupon");
    if (couponElement) {
      const current = this.getCouponCount();
      couponElement.textContent = (current + count).toLocaleString();

      // 保存到本地存储
      const stats = JSON.parse(
        localStorage.getItem("fangz_stats") || '{"coupons":0}',
      );
      stats.coupons = (stats.coupons || 0) + count;
      localStorage.setItem("fangz_stats", JSON.stringify(stats));
    }
  },
};

console.log("🎫 签到优惠券模块定义完成");
