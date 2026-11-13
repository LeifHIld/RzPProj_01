/* Payday Mini App (планы 011 и 012). Цифры приходят от бота в ссылке после «#» — на сервер они не уходят.
   Формат (v=1): ym, g, n, p?, dt, td?, ta, k?, cpm, cd, cm, cn, ci, bs, be, bt, w, i, c,
   s / ps — смены текущего / прошлого месяца «день:сумма:обычн:алко<100:алко>100:МП:МЕ:часы» (числа 36-ричные, кроме часов),
   pym, pg, pn, pp? — прошлый месяц, bot. Telegram может дописать свои tgWebApp… — их пропускаем. */
(function () {
  "use strict";
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  var MONTHS = ["", "январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь",
    "октябрь", "ноябрь", "декабрь"];
  var GENITIVE = ["", "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября",
    "октября", "ноября", "декабря"];
  var DATIVE = ["", "январю", "февралю", "марту", "апрелю", "маю", "июню", "июлю", "августу", "сентябрю",
    "октябрю", "ноябрю", "декабрю"];
  var WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  var WD_FULL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
  var MIN_DAY = 2, MIN_ALL = 3;   // как в боте: calc.BEST_DAYS_MIN_DAY / BEST_DAYS_MIN_ALL

  function parseHash(hash) {
    var out = {};
    (hash || "").replace(/^#/, "").split("&").forEach(function (part) {
      var i = part.indexOf("=");
      if (i > 0) {
        try { out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1)); } catch (e) { /* битый кусок — пропускаем */ }
      }
    });
    return out;
  }
  function num(v) { var x = Number(v); return v !== undefined && v !== "" && isFinite(x) ? x : null; }
  function list(v, n) {
    var a = String(v || "").split(",").map(num);
    return a.length === n && a.every(function (x) { return x !== null; }) ? a : null;
  }
  function shifts(v) {
    if (!v) return [];
    return String(v).split(",").map(function (e) {
      var a = e.split(":");
      if (a.length !== 8) return null;
      var n = a.slice(0, 7).map(function (x) { return parseInt(x, 36); }), h = Number(a[7]);
      if (n.some(isNaN) || !isFinite(h)) return null;
      return { d: n[0], t: n[1], r: n[2], as: n[3], ab: n[4], mp: n[5], me: n[6], h: h };
    }).filter(Boolean);
  }
  function fmt(x) { return Math.round(x).toLocaleString("ru-RU"); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function ddmm(iso) { var p = String(iso).split("-"); return p.length === 3 ? p[2] + "." + p[1] : ""; }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? few : many;
  }
  function signed(x, digits) {   // «+12», «−1 183.41» — копейки через точку, как в боте
    var d = Number(x.toFixed(digits || 0)), s = d > 0 ? "+" : d < 0 ? "−" : "±";
    var parts = Math.abs(d).toFixed(digits || 0).split(".");
    return s + Number(parts[0]).toLocaleString("ru-RU") + (parts[1] && /[1-9]/.test(parts[1]) ? "." + parts[1] : "");
  }
  function delta(cur, prev, money) {
    var d = Math.round(cur - prev), cls = d > 0 ? "up" : d < 0 ? "down" : "";
    var sign = d > 0 ? "+" : d < 0 ? "−" : "±";
    var pct = money && prev && d ? " " + sign + (Math.abs(d) / prev * 100).toFixed(1) + " %" : "";
    var tail = money ? pct : " " + sign + fmt(Math.abs(d));
    return fmt(cur) + (money ? " грн" : "") + (tail ? ' <span class="' + cls + '">' + tail.trim() + "</span>" : "");
  }

  function readData(p) {
    var ym = /^(\d{4})-(\d{2})$/.exec(p.ym || ""), pym = /^(\d{4})-(\d{2})$/.exec(p.pym || "");
    var d = {
      year: ym && +ym[1], month: ym && +ym[2], gross: num(p.g), net: num(p.n),
      date: p.dt, today: p.td !== undefined ? num(p.td) : null, avg: num(p.ta),
      w: list(p.w, 7), i: list(p.i, 7), c: list(p.c, 7), total: num(p.bt), bs: p.bs, be: p.be,
      bot: /^[A-Za-z0-9_]{5,32}$/.test(p.bot || "") ? p.bot : null, cmp: null
    };
    if (p.k === "day") {
      var cm = list(p.cm, 2), cn = list(p.cn, 2), ci = list(p.ci, 2);
      if (cm && cn && ci) d.cmp = { pm: num(p.cpm), day: num(p.cd), money: cm, n: cn, issued: ci };
    }
    if (!(p.v === "1" && d.year && d.gross !== null && d.net !== null && d.w && d.i && d.c)) return null;
    var dt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.dt || "");
    d.todayDay = dt && +dt[1] === d.year && +dt[2] === d.month ? +dt[3] : null;
    d.cal = [{ key: "cur", year: d.year, month: d.month, gross: d.gross, net: d.net, paid: num(p.p), shifts: shifts(p.s) }];
    if (pym && num(p.pg) !== null && num(p.pn) !== null) {
      d.cal.unshift({ key: "prev", year: +pym[1], month: +pym[2], gross: num(p.pg), net: num(p.pn), paid: num(p.pp), shifts: shifts(p.ps) });
    }
    return d;
  }

  /* ---------- календарь (план 012) ---------- */
  function level(t, avg) {
    var r = avg ? t / avg : 1;
    return r < 0.85 ? "l1" : r < 1 ? "l2" : r < 1.15 ? "l3" : "l4";
  }
  function wdIndex(y, m, day) { return (new Date(y, m - 1, day).getDay() + 6) % 7; }   // 0 = Пн
  function short(t) { return (Math.round(t / 100) / 10).toLocaleString("ru-RU") + "к"; }

  function calBlock(d) {
    var idx = state.view === "prev" && d.cal.length > 1 ? 0 : d.cal.length - 1, m = d.cal[idx];
    var isCur = m.key === "cur", today = isCur ? d.todayDay : null;
    var first = wdIndex(m.year, m.month, 1), nd = new Date(m.year, m.month, 0).getDate();
    var byDay = {}, sum = 0, best = null;
    m.shifts.forEach(function (s) { byDay[s.d] = s; sum += s.t; if (!best || s.t > best.t) best = s; });
    var avg = m.shifts.length ? sum / m.shifts.length : 0;
    var sel = state.sel[m.key];
    if (sel === undefined) sel = today && byDay[today] ? today : m.shifts.length ? m.shifts[m.shifts.length - 1].d : today;

    var h = '<section class="sec"><div class="calhead">' +
      '<button type="button" data-nav="prev" aria-label="Прошлый месяц"' + (isCur && d.cal.length > 1 ? "" : " disabled") + ">‹</button>" +
      "<b>" + cap(MONTHS[m.month]) + " " + m.year + "</b>" +
      '<button type="button" data-nav="cur" aria-label="Текущий месяц"' + (isCur ? " disabled" : "") + ">›</button></div>" +
      '<div class="sub center"><b>' + fmt(m.gross) + " грн</b> грязными · <b>" + fmt(m.net) + "</b> чистыми · " +
      m.shifts.length + " " + plural(m.shifts.length, "смена", "смены", "смен") + "</div>";
    if (m.paid !== null) {
      var diff = m.paid - m.net;
      h += '<div class="sub center">💳 на карту ' + fmt(m.paid) + " · " +
        (Math.abs(diff) < 0.005 ? "сошлось" : "разница " + signed(diff, 2)) + "</div>";
    }
    h += "</section>";

    var cells = WD.map(function (w) { return '<span class="wd">' + w + "</span>"; }).join("");
    for (var e = 0; e < first; e++) cells += '<span class="d empty" aria-hidden="true"></span>';
    for (var day = 1; day <= nd; day++) {
      var s = byDay[day], cls = "d" + (s ? " " + level(s.t, avg) : "") + (day === sel ? " sel" : "") +
        (day === today ? " today" : "") + (today && day > today ? " future" : "");
      var label = day + " " + GENITIVE[m.month] + (s ? ": " + fmt(s.t) + " грн" : ": смены нет");
      cells += '<button type="button" class="' + cls + '" data-day="' + day + '" aria-label="' + esc(label) + '"' +
        (day === sel ? ' aria-pressed="true"' : "") + '><span class="n">' + day + "</span>" +
        (s ? '<small>' + short(s.t) + "</small>" : "") + "</button>";
    }
    h += '<section class="sec"><div class="cal">' + cells + "</div>" +
      '<div class="legend"><span>&lt;85 %</span><i class="lg l1"></i><i class="lg l2"></i><i class="lg l3"></i><i class="lg l4"></i>' +
      "<span>&gt;115 % средней смены</span></div></section>";

    if (sel) {
      var ss = byDay[sel], wdName = cap(WD_FULL[wdIndex(m.year, m.month, sel)]);
      var title = wdName + ", " + two(sel) + "." + two(m.month) + (sel === today ? " · сегодня" : "") +
        (ss && best && ss.d === best.d && m.shifts.length > 1 ? " · лучшая смена месяца" : "");
      h += '<section class="sec"><div class="cap">' + esc(title) + "</div>";
      if (ss) {
        var pct = avg ? (ss.t / avg - 1) * 100 : 0;
        h += '<div class="row2"><span>Заработано</span><b>' + fmt(ss.t) + " грн</b></div>" +
          '<div class="row2"><span>' + ss.r + " · " + ss.as + "/" + ss.ab + " · " + ss.mp + " · " + ss.me + " · " +
          ss.h.toLocaleString("ru-RU") + ' ч</span><b class="' + (pct > 0.5 ? "up" : pct < -0.5 ? "down" : "") + '">' +
          signed(pct) + " % к средней</b></div>";
      } else {
        h += '<div class="sub">Смены нет</div>';
      }
      h += "</section>";
    }
    return h;
  }

  /* ---------- дашборд (план 011) ---------- */
  function pick(vals, counts, better) {
    var ok = [];
    for (var k = 0; k < 7; k++) if (counts[k] >= MIN_DAY) ok.push(k);
    if (!ok.length) return null;
    return ok.reduce(function (a, b) { return better(vals[b], vals[a]) ? b : a; });
  }

  function weekBlock(d, unit) {
    if ((d.total || 0) < MIN_ALL) {
      return '<div class="note">Пока мало смен, чтобы сравнивать дни: за 90 дней ' + fmt(d.total || 0) +
        ". Нужно хотя бы " + MIN_ALL + ".</div>";
    }
    var vals = unit === "money" ? d.w : d.i;
    var best = pick(vals, d.c, function (a, b) { return a > b; });
    var okCount = d.c.filter(function (n) { return n >= MIN_DAY; }).length;
    var worst = okCount > 1 ? pick(vals, d.c, function (a, b) { return a < b; }) : null;
    var top = Math.max.apply(null, vals.map(function (v, k) { return d.c[k] ? v : 0; })) || 1;
    var bars = "", few = [];
    for (var k = 0; k < 7; k++) {
      var has = d.c[k] > 0, cls = "bar" + (k === best ? " best" : "") + (has && d.c[k] < MIN_DAY ? " few" : "");
      var label = has ? fmt(vals[k]) + (k === best ? " ⭐" : "") : "—";
      var h = has ? Math.round(vals[k] / top * 100) : 0;
      bars += '<div class="' + cls + '" role="img" aria-label="' + WD_FULL[k] + ": " + label + '">' +
        '<span class="v">' + label + '</span><i style="height:' + h + 'px"></i></div>';
      if (has && d.c[k] < MIN_DAY) few.push(WD[k] + ": " + d.c[k] + " " + plural(d.c[k], "смена", "смены", "смен"));
    }
    var note = best !== null
      ? "⭐ " + cap(WD_FULL[best]) + " — лучший день" + (worst !== null ? " · худший — " + WD_FULL[worst] : "") + "."
      : "Пока нет дня, где хотя бы " + MIN_DAY + " смены.";
    if (few.length) note += " " + few.join(", ") + " — не сравниваем.";
    return '<div class="bars">' + bars + '</div><div class="days">' +
      WD.map(function (w) { return "<span>" + w + "</span>"; }).join("") + '</div><div class="note">' + esc(note) + "</div>";
  }

  function render(d) {
    var h = calBlock(d);   // план 012: сверху календарь и выбранный день, ниже — дашборд текущего месяца
    h += '<section class="sec"><div class="cap">Сегодня, ' + esc(ddmm(d.date)) + "</div>";
    if (d.today !== null) {
      h += '<div class="row2"><span>Смена</span><b>' + fmt(d.today) + " грн</b></div>";
      if (d.avg) {
        var pct = Math.round((d.today / d.avg - 1) * 100);
        h += '<div class="row2"><span>К средней смене (' + fmt(d.avg) + ')</span><b class="' +
          (pct > 0 ? "up" : pct < 0 ? "down" : "") + '">' + (pct > 0 ? "+" : pct < 0 ? "−" : "±") + Math.abs(pct) + " %</b></div>";
      }
    } else {
      h += '<div class="sub">Сегодня смены нет</div>';
    }
    h += "</section>";
    if (d.cmp) {
      var c = d.cmp;
      h += '<section class="sec"><div class="cap">К ' + DATIVE[c.pm] + " на то же число (1–" + c.day + ")</div>" +
        '<div class="row2"><span>За смены</span><b>' + delta(c.money[0], c.money[1], true) + "</b></div>" +
        '<div class="row2"><span>Смен</span><b>' + delta(c.n[0], c.n[1]) + "</b></div>" +
        '<div class="row2"><span>Все выдачи</span><b>' + delta(c.issued[0], c.issued[1]) + "</b></div></section>";
    }
    h += '<section class="sec"><div class="cap">По дням недели · ' + esc(ddmm(d.bs)) + "–" + esc(ddmm(d.be)) +
      ", в среднем за смену</div>" +
      '<div class="seg" role="group" aria-label="Что показать">' +
      '<button type="button" data-unit="money" aria-pressed="' + (state.unit === "money") + '">грн</button>' +
      '<button type="button" data-unit="issued" aria-pressed="' + (state.unit === "issued") + '">выдачи</button></div>' +
      weekBlock(d, state.unit) + "</section>";
    if (d.bot) {
      h += '<button type="button" class="btn main" data-go="add">➕ Добавить смену</button>' +
        '<button type="button" class="btn second" data-go="export">📤 Экспорт</button>';
    }
    return h;
  }

  function emptyView() {
    return '<section class="sec empty"><div class="ico" aria-hidden="true">📱</div><b>Откройте страницу из бота</b>' +
      '<div class="sub">Нажмите «📊 Статистика», затем «📱 Тест» — цифры приходят вместе с кнопкой.</div></section>';
  }

  function go(bot, what) {
    var link = "https://t.me/" + bot + "?start=" + what;
    if (tg && tg.openTelegramLink) { tg.openTelegramLink(link); tg.close(); } else { window.location.href = link; }
  }

  var app = document.getElementById("app");
  var data = readData(parseHash(window.location.hash));
  var state = { unit: "money", view: "cur", sel: {} };
  function draw() { app.innerHTML = data ? render(data) : emptyView(); }
  app.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || !data || b.disabled) return;
    if (b.dataset.unit) { state.unit = b.dataset.unit; draw(); }
    else if (b.dataset.nav) { state.view = b.dataset.nav; draw(); }
    else if (b.dataset.day) {
      state.sel[state.view === "prev" && data.cal.length > 1 ? "prev" : "cur"] = +b.dataset.day;
      draw();
    } else if (b.dataset.go) go(data.bot, b.dataset.go);
  });
  draw();
  window.PaydayMiniApp = { parseHash: parseHash, readData: readData, shifts: shifts };  // для проверки в браузере
})();
