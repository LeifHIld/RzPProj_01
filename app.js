/* Payday Mini App (план 011). Цифры приходят от бота в ссылке после «#» — на сервер они не уходят.
   Формат (v=1): ym, g, n, dt, td?, ta, k?, cpm, cd, cm, cn, ci, bs, be, bt, w, i, c, bot.
   Telegram может дописать в ту же часть ссылки свои tgWebApp… — их пропускаем. */
(function () {
  "use strict";
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  var MONTHS = ["", "январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь",
    "октябрь", "ноябрь", "декабрь"];
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
  function num(v) { var x = Number(v); return isFinite(x) ? x : null; }
  function list(v, n) {
    var a = String(v || "").split(",").map(num);
    return a.length === n && a.every(function (x) { return x !== null; }) ? a : null;
  }
  function fmt(x) { return Math.round(x).toLocaleString("ru-RU"); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function ddmm(iso) { var p = String(iso).split("-"); return p.length === 3 ? p[2] + "." + p[1] : ""; }
  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? few : many;
  }
  function delta(cur, prev, money) {
    var d = Math.round(cur - prev), cls = d > 0 ? "up" : d < 0 ? "down" : "";
    var sign = d > 0 ? "+" : d < 0 ? "−" : "±";
    var pct = money && prev && d ? " " + sign + (Math.abs(d) / prev * 100).toFixed(1) + " %" : "";
    var tail = money ? pct : " " + sign + fmt(Math.abs(d));
    return fmt(cur) + (money ? " грн" : "") + (tail ? ' <span class="' + cls + '">' + tail.trim() + "</span>" : "");
  }

  function readData(p) {
    var ym = /^(\d{4})-(\d{2})$/.exec(p.ym || "");
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
    return p.v === "1" && d.year && d.gross !== null && d.net !== null && d.w && d.i && d.c ? d : null;
  }

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

  function render(d, unit) {
    var h = '<section class="sec"><div class="cap">' + cap(MONTHS[d.month]) + " " + d.year + "</div>" +
      '<div class="big">' + fmt(d.gross) + ' грн</div><div class="sub">грязными · <b>' + fmt(d.net) +
      " грн</b> чистыми</div></section>";
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
      '<button type="button" data-unit="money" aria-pressed="' + (unit === "money") + '">грн</button>' +
      '<button type="button" data-unit="issued" aria-pressed="' + (unit === "issued") + '">выдачи</button></div>' +
      weekBlock(d, unit) + "</section>";
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
  var unit = "money";
  function draw() { app.innerHTML = data ? render(data, unit) : emptyView(); }
  app.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || !data) return;
    if (b.dataset.unit) { unit = b.dataset.unit; draw(); }
    if (b.dataset.go) go(data.bot, b.dataset.go);
  });
  draw();
  window.PaydayMiniApp = { parseHash: parseHash, readData: readData };  // для проверки в браузере
})();
