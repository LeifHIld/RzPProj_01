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
  var PREPOSITIONAL = ["", "январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре",
    "октябре", "ноябре", "декабре"];
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
    // план 014: тарифы месяца (часы, обычная, алко<100, алко>100, МП, МЕ) и итоги для «Подробнее о месяце»
    function card(pre) {
      return { kc: num(p[pre + "kc"]), km: num(p[pre + "km"]), hp: num(p[pre + "hp"]), mh: num(p[pre + "mh"]) };
    }
    d.dh = num(p.dh) !== null ? num(p.dh) : 12;
    d.cal = [{ key: "cur", year: d.year, month: d.month, gross: d.gross, net: d.net, paid: num(p.p), shifts: shifts(p.s),
      rates: list(p.r, 6), card: card("") }];
    if (pym && num(p.pg) !== null && num(p.pn) !== null) {
      d.cal.unshift({ key: "prev", year: +pym[1], month: +pym[2], gross: num(p.pg), net: num(p.pn), paid: num(p.pp),
        shifts: shifts(p.ps), rates: list(p.pr, 6), card: card("p") });
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
    if (sel === undefined) {
      sel = today && byDay[today] ? today : m.shifts.length ? m.shifts[m.shifts.length - 1].d : today;
      if (sel) state.sel[m.key] = sel;   // чтобы «✏️ Изменить» знал, какой день выбран
    }

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
    // план 014: «💳 Пришло на карту» за показанный месяц и «Подробнее о месяце»
    if (state.payOpen === m.key) {
      h += '<div class="payform"><input id="pay-amount" type="number" inputmode="decimal" min="0" step="0.01" ' +
        'placeholder="Сколько пришло, грн" value="' + (m.paid !== null ? m.paid : "") + '">' +
        '<button type="button" class="btn main" data-act="pay-save"' + (d.bot ? "" : " disabled") + ">Сохранить</button></div>" +
        '<div class="note">Откроется чат — бот покажет сверку с «чистыми», записывает по ✅.</div>';
    } else {
      h += '<button type="button" class="field" data-act="pay-open"><span>💳 Пришло на карту за ' + MONTHS[m.month] + "</span><b>" +
        (m.paid !== null ? "изменить" : "ввести") + "</b></button>";
    }
    h += '<button type="button" class="more" data-act="mmore">' + (state.monthOpen ? "Свернуть ▴" : "Подробнее о месяце ▾") + "</button>";
    if (state.monthOpen) h += monthCard(m);
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
      var future = isFuture(d, m, sel), editing = state.form && state.form.key === m.key && state.form.day === sel;
      var title = wdName + ", " + two(sel) + "." + two(m.month) + (sel === today ? " · сегодня" : "") +
        (ss && best && ss.d === best.d && m.shifts.length > 1 ? " · лучшая смена месяца" : "");
      h += '<section class="sec"><div class="cap">' + esc(title) + "</div>";
      if (editing) {
        h += formBlock(d, m);
      } else if (ss) {
        var pct = avg ? (ss.t / avg - 1) * 100 : 0;
        h += '<div class="row2"><span>Заработано</span><b>' + fmt(ss.t) + " грн</b></div>" +
          '<div class="row2"><span>' + ss.r + " · " + ss.as + "/" + ss.ab + " · " + ss.mp + " · " + ss.me + " · " +
          ss.h.toLocaleString("ru-RU") + ' ч</span><b class="' + (pct > 0.5 ? "up" : pct < -0.5 ? "down" : "") + '">' +
          signed(pct) + " % к средней</b></div>";
        if (state.dayOpen) h += breakdown(ss, m.rates);
        h += '<div class="row2"><button type="button" class="more" data-act="dmore">' + (state.dayOpen ? "Свернуть ▴" : "Подробнее ▾") +
          '</button><button type="button" class="more" data-act="edit"' + (d.bot ? "" : " disabled") + ">✏️ Изменить</button></div>";
      } else if (future) {
        h += '<div class="sub">Этот день ещё не наступил</div>';
      } else {
        h += '<div class="sub">Смены нет</div>' + (d.bot ? '<button type="button" class="more" data-act="edit">➕ Добавить смену на этот день</button>' : "");
      }
      h += "</section>";
    }
    return h;
  }

  /* ---------- подробности (план 014, G-002 б) ---------- */
  function breakdown(s, r) {
    if (!r) return '<div class="note">Тарифов в ссылке нет — откройте страницу заново из бота.</div>';
    var alco = s.as * r[2] + s.ab * r[3], rows = [], total = 0;
    rows.push(["Обычная", s.r + " × " + nice(r[1]), s.r * r[1]]);
    rows.push(["Алко-чек", s.as + "×" + nice(r[2]) + " + " + s.ab + "×" + nice(r[3]), alco]);
    rows.push(["МП", s.mp + " × " + nice(r[4]), s.mp * r[4]]);
    rows.push(["МЕ", s.me + " × " + nice(r[5]), s.me * r[5]]);
    rows.push(["Часы", s.h.toLocaleString("ru-RU") + " × " + nice(r[0]), s.h * r[0]]);
    rows.forEach(function (x) { total += x[2]; });
    var html = '<table class="tbl">' + rows.map(function (x) {
      return "<tr><td>" + x[0] + '</td><td class="m">' + x[1] + "</td><td>" + fmt(x[2]) + "</td></tr>";
    }).join("") + "</table>";
    if (Math.abs(total - s.t) > 1) html += '<div class="note">Тарифы в этом месяце менялись — расшифровка по тарифам на конец месяца.</div>';
    return html;
  }
  function nice(x) { return Number(x.toFixed(2)).toLocaleString("ru-RU").replace(",", "."); }
  function monthCard(m) {
    var c = m.card || {}, km = c.km || 0, hp = c.hp || 0, piece = m.gross - km - hp;
    var hours = m.shifts.reduce(function (a, s) { return a + s.h; }, 0);
    return '<div class="mcard"><div class="row2"><span>Сдельно (выдачи и чеки)</span><b>' + fmt(piece) + " грн</b></div>" +
      '<div class="row2"><span>Часы · ' + (c.mh !== null && c.mh !== undefined ? nice(c.mh) + " — введено" : nice(hours) + " — по сменам") +
      "</span><b>" + fmt(hp) + " грн</b></div>" +
      '<div class="row2"><span>Приём и курьер · ' + fmt(c.kc || 0) + " " + plural(c.kc || 0, "посылка", "посылки", "посылок") +
      "</span><b>" + fmt(km) + " грн</b></div>" +
      '<div class="row2 sub"><span>ПДФО 18 % · военный сбор 5 %</span><span>−' + fmt(m.gross - m.net) + " грн</span></div></div>";
  }

  /* ---------- ввод прямо в календаре (план 014, G-005 б) ---------- */
  var FIELDS = [["r", "Обычная выдача", 1], ["as", "Алко-чек <100", 2], ["ab", "Алко-чек >100", 3], ["mp", "МП", 4],
    ["me", "МЕ", 5], ["h", "Часы", 0]];
  function isFuture(d, m, day) {
    var dt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.date || "");
    if (!dt) return false;
    var a = m.year * 10000 + m.month * 100 + day, b = +dt[1] * 10000 + +dt[2] * 100 + +dt[3];
    return a > b;
  }
  function formTotal(v, r) {
    if (!r) return null;
    return v.r * r[1] + v.as * r[2] + v.ab * r[3] + v.mp * r[4] + v.me * r[5] + v.h * r[0];
  }
  function formBlock(d, m) {
    var v = state.form.vals, total = formTotal(v, m.rates);
    var html = FIELDS.map(function (f) {
      var rate = m.rates ? nice(m.rates[f[2]]) + (f[0] === "h" ? " грн/ч" : " грн") : "";
      return '<div class="step"><span>' + esc(f[1]) + "<small>" + rate + '</small></span><span class="ctl">' +
        '<button type="button" data-step="' + f[0] + '" data-d="-1" aria-label="Меньше">−</button>' +
        '<input type="number" inputmode="decimal" min="0" step="' + (f[0] === "h" ? "0.5" : "1") + '" data-field="' + f[0] +
        '" value="' + v[f[0]] + '" aria-label="' + esc(f[1]) + '">' +
        '<button type="button" data-step="' + f[0] + '" data-d="1" aria-label="Больше">+</button></span></div>';
    }).join("");
    html += '<div class="row2"><span>Итого за смену</span><b id="form-total">' + (total !== null ? fmt(total) + " грн" : "—") + "</b></div>" +
      '<button type="button" class="btn main" data-act="save-shift">Сохранить смену ' + two(state.form.day) + "." + two(m.month) +
      "</button>" + '<button type="button" class="more" data-act="cancel-form">Отмена</button>' +
      '<div class="note">Откроется чат — бот покажет «Проверь смену», сохраняет по ✅.</div>';
    return html;
  }
  function shiftParam(m, day, v) {
    function ok(x) { return isFinite(x) && x >= 0 && x <= 999 && Math.floor(x) === x; }
    if (![v.r, v.as, v.ab, v.mp, v.me].every(ok) || !(v.h >= 0 && v.h <= 24)) return null;
    var hours = String(Math.round(v.h * 100) / 100).replace(".", "-");
    return "s_" + m.year + two(m.month) + two(day) + "_" + [v.r, v.as, v.ab, v.mp, v.me].join("_") + "_" + hours;
  }
  function payParam(m, amount) {
    if (!(amount >= 0 && amount <= 10000000)) return null;
    return "pay_" + m.year + two(m.month) + "_" + String(Math.round(amount * 100) / 100).replace(".", "-");
  }

  /* ---------- кривая месяца (план 014, G-003 а) ---------- */
  function cumulative(m, upto) {
    var by = {}, out = [], s = 0;
    m.shifts.forEach(function (x) { by[x.d] = x.t; });
    for (var day = 1; day <= upto; day++) { s += by[day] || 0; out.push(s); }
    return out;
  }
  function curveBlock(d) {
    if (d.cal.length < 2 || !d.todayDay) return "";
    var prev = d.cal[0], cur = d.cal[1];
    if (!prev.shifts.length && !cur.shifts.length) return "";
    var pDays = new Date(prev.year, prev.month, 0).getDate();
    var a = cumulative(cur, d.todayDay), b = cumulative(prev, pDays);
    var top = Math.max(a[a.length - 1] || 0, b[b.length - 1] || 0) || 1, W = 300, H = 140, X0 = 26;
    function pts(arr) {
      return arr.map(function (v, i) {
        return Math.round(X0 + i / 30 * (W - X0 - 4)) + "," + Math.round(H - 16 - v / top * (H - 26));
      }).join(" ");
    }
    var grid = "", step = top > 30000 ? 10000 : top > 10000 ? 5000 : top > 4000 ? 2000 : 1000;
    for (var k = 0; k <= top; k += step) {
      var y = Math.round(H - 16 - k / top * (H - 26));
      grid += '<line x1="' + X0 + '" x2="' + (W - 2) + '" y1="' + y + '" y2="' + y + '" class="gl"/>' +
        '<text x="0" y="' + (y + 3) + '" class="gt">' + (k / 1000) + "к</text>";
    }
    var last = a.length - 1;
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" class="curve" role="img" aria-label="Заработок нарастающим итогом">' + grid +
      (prev.shifts.length ? '<polyline points="' + pts(b) + '" class="lp"/>' : "") +
      '<polyline points="' + pts(a) + '" class="lc"/>' +
      '<circle cx="' + Math.round(X0 + last / 30 * (W - X0 - 4)) + '" cy="' + Math.round(H - 16 - a[last] / top * (H - 26)) + '" r="3.5" class="dot"/>' +
      '<text x="' + X0 + '" y="' + (H - 2) + '" class="gt">1</text><text x="' + (W - 14) + '" y="' + (H - 2) + '" class="gt">31</text></svg>';
    var h = '<section class="sec"><div class="cap">' + cap(MONTHS[cur.month]) + " против " + MONTHS[prev.month] +
      " · нарастающим итогом, по сменам</div>" + svg +
      '<div class="lgd"><span><i></i>' + MONTHS[cur.month] + '</span><span><i class="p"></i>' + MONTHS[prev.month] + "</span></div>";
    if (prev.shifts.length) {
      var diff = a[last] - b[Math.min(last, b.length - 1)];
      h += '<div class="row2"><span>На ' + two(d.todayDay) + "." + two(cur.month) + '</span><b class="' + (diff >= 0 ? "up" : "down") + '">' +
        signed(diff) + " грн к " + DATIVE[prev.month] + "</b></div>";
    } else {
      h += '<div class="note">В ' + PREPOSITIONAL[prev.month] + " смен не было — сравнивать не с чем.</div>";
    }
    return h + "</section>";
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
    var h = "";
    if (state.stale) {   // открыли с ярлыка — снимок из облака Telegram (план 014, G-004)
      var t = new Date(state.stale);
      h += '<div class="stale">Цифры на ' + two(t.getDate()) + "." + two(t.getMonth() + 1) + ", " + two(t.getHours()) + ":" +
        two(t.getMinutes()) + " · свежие — «📊 Статистика» в боте</div>";
    }
    h += calBlock(d);   // план 012: сверху календарь и выбранный день, ниже — дашборд текущего месяца
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
    h += curveBlock(d);   // план 014: кривая месяца перед «По дням недели»
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
    if (state.homeOk) {   // план 014, G-004 а: ярлык на экран — последняя кнопка
      h += '<button type="button" class="btn second" data-act="home">📲 Добавить на экран телефона</button>';
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
  var hash = window.location.hash;
  var data = readData(parseHash(hash));
  var state = { unit: "money", view: "cur", sel: {}, dayOpen: false, monthOpen: false, form: null, payOpen: null,
    stale: null, homeOk: false };
  function shown() { return data.cal[state.view === "prev" && data.cal.length > 1 ? 0 : data.cal.length - 1]; }
  function draw() { app.innerHTML = data ? render(data) : emptyView(); }
  function haptic() { try { if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged(); } catch (e) { /* нет — не важно */ } }
  function vibe() { try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light"); } catch (e) { /* нет */ } }

  function openForm(m, day) {
    var s = m.shifts.filter(function (x) { return x.d === day; })[0];
    state.form = { key: m.key, day: day,
      vals: s ? { r: s.r, as: s.as, ab: s.ab, mp: s.mp, me: s.me, h: s.h } : { r: 0, as: 0, ab: 0, mp: 0, me: 0, h: data.dh } };
  }
  function updateTotal() {
    var el = document.getElementById("form-total"), m = shown();
    if (el && state.form) {
      var t = formTotal(state.form.vals, m.rates);
      el.textContent = t !== null ? fmt(t) + " грн" : "—";
    }
  }

  app.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || !data || b.disabled) return;
    var m = shown(), act = b.dataset.act;
    if (b.dataset.unit) { state.unit = b.dataset.unit; draw(); }
    else if (b.dataset.nav) { state.view = b.dataset.nav; state.form = null; state.payOpen = null; draw(); }
    else if (b.dataset.day) {
      var day = +b.dataset.day, has = m.shifts.some(function (x) { return x.d === day; });
      state.sel[m.key] = day;
      state.form = null;
      // G-005 б: нажали пустой прошедший день или сегодня — сразу форма
      if (!has && !isFuture(data, m, day) && data.bot) openForm(m, day);
      haptic();
      draw();
    }
    else if (b.dataset.step) {
      var f = b.dataset.step, stepv = f === "h" ? 0.5 : 1;
      state.form.vals[f] = Math.max(0, Math.round((state.form.vals[f] + stepv * +b.dataset.d) * 100) / 100);
      var inp = app.querySelector('input[data-field="' + f + '"]');
      if (inp) inp.value = state.form.vals[f];
      updateTotal();
      haptic();
    }
    else if (act === "dmore") { state.dayOpen = !state.dayOpen; draw(); }
    else if (act === "mmore") { state.monthOpen = !state.monthOpen; draw(); }
    else if (act === "edit") { openForm(m, state.sel[m.key] || data.todayDay); draw(); }
    else if (act === "cancel-form") { state.form = null; draw(); }
    else if (act === "save-shift") {
      var p = shiftParam(m, state.form.day, state.form.vals);
      if (!p) { alertMsg("Проверьте цифры: целые от 0 до 999, часы — от 0 до 24."); return; }
      vibe();
      go(data.bot, p);
    }
    else if (act === "pay-open") { state.payOpen = m.key; draw(); var pi = document.getElementById("pay-amount"); if (pi) pi.focus(); }
    else if (act === "pay-save") {
      var amount = Number((document.getElementById("pay-amount") || {}).value);
      var pp = payParam(m, amount);
      if (!pp || !(amount > 0)) { alertMsg("Введите сумму, например 22500."); return; }
      vibe();
      go(data.bot, pp);
    }
    else if (act === "home") { try { tg.addToHomeScreen(); } catch (err) { /* старый Telegram */ } }
    else if (b.dataset.go) go(data.bot, b.dataset.go);
  });
  app.addEventListener("input", function (e) {
    var f = e.target.dataset && e.target.dataset.field;
    if (!f || !state.form) return;
    var v = Number(e.target.value);
    state.form.vals[f] = isFinite(v) && v >= 0 ? v : 0;
    updateTotal();
  });
  function alertMsg(text) { if (tg && tg.showAlert) tg.showAlert(text); else window.alert(text); }

  /* ---------- снимок в облаке Telegram и ярлык на экран (план 014, G-004 а) ---------- */
  var cloud = tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") ? tg.CloudStorage : null;
  function ownHash(h) {   // только наши параметры — без tgWebApp…, которые дописывает Telegram
    return "#" + h.replace(/^#/, "").split("&").filter(function (x) { return x && x.indexOf("tgWebApp") !== 0; }).join("&");
  }
  if (data && cloud) {
    try { cloud.setItem("snap", JSON.stringify({ h: ownHash(hash), at: Date.now() })); } catch (e) { /* не сохранилось — не страшно */ }
  }
  if (!data && cloud) {
    cloud.getItem("snap", function (err, val) {
      if (err || !val) return;
      try {
        var snap = JSON.parse(val);
        data = readData(parseHash(snap.h));
        if (data) { state.stale = snap.at; draw(); }
      } catch (e) { /* снимок испорчен — остаётся подсказка */ }
    });
  }
  if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast("8.0") && tg.addToHomeScreen) {
    state.homeOk = true;
    try {
      tg.checkHomeScreenStatus(function (status) {
        if (status === "added" || status === "unsupported") { state.homeOk = false; draw(); }
      });
      tg.onEvent("homeScreenAdded", function () { state.homeOk = false; draw(); });
    } catch (e) { state.homeOk = false; }
  }

  draw();
  window.PaydayMiniApp = { parseHash: parseHash, readData: readData, shifts: shifts, shiftParam: shiftParam, payParam: payParam };
})();
