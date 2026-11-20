/* Payday Mini App (планы 011, 012, 014, 015). Цифры приходят от бота в ссылке после «#» — на сервер они не уходят.
   Формат (v=1): ym, g, n, p?, dt, td?, ta, k?, cpm, cd, cm, cn, ci, bs, be, bt, w, i, c,
   s / ps — смены текущего / прошлого месяца «день:сумма:обычн:алко<100:алко>100:МП:МЕ:часы» (числа 36-ричные, кроме часов),
   pym, pg, pn, pp? — прошлый месяц, bot. Telegram может дописать свои tgWebApp… — их пропускаем.
   План 014: r / pr — тарифы (час, обычн, алко<100, алко>100, МП, МЕ), dh, kc/km/hp/mh? и pkc/pkm/php/pmh?.
   План 015: hh / phh — обычные часы месяца: у таких смен «:часы» нет; пустая сумма («12::…») — считаем по r;
   pr / pq нет — те же, что r / q; q / pq — тарифы приёма и курьера, kk / pkk — посылки по графам.
   План 016: pf — итоги за всё время для «👤 Профиля» (28 значений, см. bot.profile_field), nm — имя в таблице.
   План 019: nb — имя в таблице в base64 (вместо nm), gr / gn — график текущего / следующего месяца (bot.sched_field). */
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
  // usual — обычные часы месяца (hh), r — тарифы месяца: по ним сумма, если бот её не прислал (план 015)
  function shifts(v, usual, r) {
    if (!v) return [];
    return String(v).split(",").map(function (e) {
      var a = e.split(":");
      if (a.length !== 7 && a.length !== 8) return null;
      var h = a.length === 8 ? Number(a[7]) : usual;
      if (h === null || h === undefined || !isFinite(h)) return null;
      var n = a.slice(0, 7).map(function (x, k) { return k === 1 && x === "" ? null : parseInt(x, 36); });
      if (n.some(function (x) { return x !== null && isNaN(x); }) || n[0] === null) return null;
      var s = { d: n[0], t: n[1], r: n[2], as: n[3], ab: n[4], mp: n[5], me: n[6], h: h };
      if (s.t === null) {
        if (!r) return null;
        s.t = shiftTotal(s, r);
      }
      return s;
    }).filter(Boolean);
  }
  function shiftTotal(s, r) {   // как bot.page_total
    return s.h * r[0] + s.r * r[1] + s.as * r[2] + s.ab * r[3] + s.mp * r[4] + s.me * r[5];
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
    var r = list(p.r, 6), pr = list(p.pr, 6) || r, q = list(p.q, 6), pq = list(p.pq, 6) || q;
    d.cal = [{ key: "cur", year: d.year, month: d.month, gross: d.gross, net: d.net, paid: num(p.p),
      shifts: shifts(p.s, num(p.hh), r), rates: r, card: card(""), q: q, kk: list(p.kk, 6) }];
    if (pym && num(p.pg) !== null && num(p.pn) !== null) {
      d.cal.unshift({ key: "prev", year: +pym[1], month: +pym[2], gross: num(p.pg), net: num(p.pn), paid: num(p.pp),
        shifts: shifts(p.ps, num(p.phh), pr), rates: pr, card: card("p"), q: pq, kk: list(p.pkk, 6) });
    }
    d.pf = readProfile(p.pf);   // план 016
    d.nm = (p.nb ? b64text(p.nb) : p.nm ? String(p.nm) : "").slice(0, 40);   // план 019: nb — base64, nm — старые снимки
    var nx = d.month === 12 ? [d.year + 1, 1] : [d.year, d.month + 1];
    d.gr = readSched(p.gr, d.year, d.month);   // план 019: «📅 Мой график» — текущий и следующий месяц
    d.gn = readSched(p.gn, nx[0], nx[1]);
    return d;
  }
  function b64text(v) {
    try {
      var bin = atob(String(v).replace(/-/g, "+").replace(/_/g, "/")), bytes = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      return new TextDecoder("utf-8").decode(bytes);
    } catch (e) { return ""; }
  }

  /* ---------- «📅 Мой график» (план 019, G-009 а): «знаки по дням,ММДД[,ЧЧММ-ЧЧММ]», см. bot.sched_field ---------- */
  function readSched(v, y, m) {
    if (!v || !y) return null;
    var a = String(v).split(","), codes = a[0] || "";
    if (!/^[0-9a-oswv_-]{1,31}$/.test(codes)) return null;
    var days = codes.split("").map(function (c) {
      if (c === "-") return { k: "off" };
      if (c === "v") return { k: "vac" };
      if (c === "s") return { k: "sick" };
      if (c === "w") return { k: "w", h: null };
      if (c === "_") return null;
      var h = parseInt(c, 36);
      return h >= 1 && h <= 24 ? { k: "w", h: h } : null;
    });
    var at = /^(\d{2})(\d{2})$/.exec(a[1] || ""), t = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(a[2] || ""), timeH = null;
    if (t) {
      var mins = ((+t[3] * 60 + +t[4]) - (+t[1] * 60 + +t[2]) + 1440) % 1440 || 1440;
      timeH = Math.round(mins / 6) / 10;
    }
    return { y: y, m: m, days: days, at: at ? at[2] + "." + at[1] : null,
      time: t ? t[1] + ":" + t[2] + "–" + t[3] + ":" + t[4] : null, timeH: timeH };
  }
  function schedDay(g, day) { return g && day >= 1 && day <= g.days.length ? g.days[day - 1] : null; }
  function schedHours(d, m, day) {   // часы по графику для формы смены (D-51)
    var g = m.key === "cur" ? d.gr : null, e = schedDay(g, day);
    return e && e.k === "w" && e.h ? e.h : null;
  }
  function shiftWhen(g, e) {   // « · 08:00–20:00» или « · 12 ч»
    return e.h && g.time && e.h === g.timeH ? " · " + g.time : e.h ? " · " + nice(e.h) + " ч" : "";
  }
  function nextShift(d, done) {   // ближайшая смена по графику с сегодняшнего дня (сегодняшняя внесена — со следующей)
    var today = d.todayDay || 1;
    var list = [[d.gr, today], [d.gn, 1]];
    for (var i = 0; i < list.length; i++) {
      var g = list[i][0];
      if (!g) continue;
      for (var day = list[i][1]; day <= g.days.length; day++) {
        var e = g.days[day - 1];
        if (e && e.k === "w" && !(g === d.gr && day === d.todayDay && done[day])) return { g: g, day: day, e: e };
      }
    }
    return null;
  }
  function whenLabel(d, n) {
    var wd = WD[wdIndex(n.g.y, n.g.m, n.day)] + " " + two(n.day) + "." + two(n.g.m);
    if (n.g === d.gr && n.day === d.todayDay) return "сегодня, " + wd;
    var t = new Date(d.year, d.month - 1, (d.todayDay || 0) + 1);
    return t.getFullYear() === n.g.y && t.getMonth() + 1 === n.g.m && t.getDate() === n.day ? "завтра, " + wd : wd;
  }
  function schedBlock(d) {
    var up = d.bot ? '<button type="button" class="btn second gbtn" data-go="grafik">📷 Загрузить фото графика</button>' : "";
    if (!d.gr && !d.gn) {
      return '<section class="sec"><div class="cap">📅 Мой график</div><div class="gempty"><div class="ico" aria-hidden="true">🗓</div>' +
        "<b>Графика пока нет</b><div class=\"sub\">Загрузи фото графика — бот найдёт твою строку и покажет смены здесь.</div></div>" +
        up + "</section>";
    }
    var g = state.gview === "next" && d.gn || !d.gr ? d.gn : d.gr, isCur = g === d.gr;
    var today = isCur ? d.todayDay : null, nd = new Date(g.y, g.m, 0).getDate();
    var cur = d.cal[d.cal.length - 1], done = {};
    if (isCur) cur.shifts.forEach(function (s) { done[s.d] = true; });
    var h = '<section class="sec"><div class="calhead gnav"><span class="cap">📅 Мой график</span><span>' +
      '<button type="button" data-gnav="cur" aria-label="Текущий месяц"' + (!isCur && d.gr ? "" : " disabled") + ">‹</button>" +
      "<b>" + cap(MONTHS[g.m]) + "</b>" +
      '<button type="button" data-gnav="next" aria-label="Следующий месяц"' + (isCur && d.gn ? "" : " disabled") + ">›</button></span></div>";
    var n = isCur ? nextShift(d, done) : null;
    if (!isCur) {
      for (var fd = 1; fd <= g.days.length && !n; fd++) if (g.days[fd - 1] && g.days[fd - 1].k === "w") n = { g: g, day: fd, e: g.days[fd - 1] };
    }
    if (n) {
      h += '<div class="gnext">' + (isCur ? "Следующая смена: <b>" : "Первая смена: <b>") + esc(whenLabel(d, n)) + "</b>" +
        esc(shiftWhen(n.g, n.e)) + "</div>";
    }
    var first = wdIndex(g.y, g.m, 1), cells = WD.map(function (w) { return '<span class="wd">' + w + "</span>"; }).join("");
    for (var k = 0; k < first; k++) cells += '<span class="gd empty" aria-hidden="true"></span>';
    var work = 0, hours = 0, entered = 0, ahead = 0, missed = [], away = false, vac = [];
    for (var day = 1; day <= nd; day++) {
      var e = schedDay(g, day), cls = "gd", small = "", label = day + " " + GENITIVE[g.m] + ": ";
      if (e && e.k === "w") {
        work++;
        hours += e.h || d.dh;
        if (today && day < today && !done[day]) { cls += " miss"; small = "!"; missed.push(day); label += "смена, в боте её нет"; }
        else if (today && day <= today && done[day]) { cls += " w"; entered++; label += "смена, внесена"; }
        else { cls += isCur && today === null ? " w" : " p"; ahead++; label += "смена"; }
        if (!small) small = e.h ? nice(e.h) + " ч" : "смена";
        if (e.h) label += ", " + nice(e.h) + " ч";
      } else if (e && (e.k === "vac" || e.k === "sick")) {
        cls += " o"; away = true; small = e.k === "vac" ? "отп" : "бол"; label += e.k === "vac" ? "отпуск" : "больничный";
        if (e.k === "vac") vac.push(day);
      } else {
        label += e ? "выходной" : "нет в графике";
      }
      if (day === today) cls += " today";
      cells += '<span class="' + cls + '" role="img" aria-label="' + esc(label) + '"><span class="n">' + day + "</span>" +
        (small ? "<small>" + small + "</small>" : "") + "</span>";
    }
    h += '<div class="gcal">' + cells + "</div>";
    h += '<div class="glg">' + (today ? '<span><i class="w"></i>отработано</span><span><i class="p"></i>впереди</span>'
      : '<span><i class="p"></i>смена</span>') + '<span><i class="x"></i>выходной</span>' +
      (away ? '<span><i class="o"></i>отпуск, больничный</span>' : "") + (today ? '<span><i class="t"></i>сегодня</span>' : "") + "</div>";
    if (isCur && today) {
      h += '<div class="tiles t3 gtiles">' + tile(work, "смен по графику") + tile(entered, "внесено в бот") + tile(ahead, "впереди") + "</div>";
    } else {
      h += '<div class="tiles' + (vac.length ? " t3" : "") + ' gtiles">' + tile(work, plural(work, "смена", "смены", "смен") + " по графику") +
        '<div class="tile"><b>' + nice(hours) + " ч</b><small>по графику</small></div>" +
        (vac.length ? '<div class="tile"><b>' + vac[0] + (vac.length > 1 ? "–" + vac[vac.length - 1] : "") + "</b><small>отпуск</small></div>" : "") + "</div>";
    }
    missed.slice(0, 3).forEach(function (md) {
      h += '<div class="gwarn">⚠️ ' + two(md) + "." + two(g.m) + " по графику смена, а в боте её нет" +
        (d.bot ? ' · <button type="button" class="glink" data-gfix="' + md + '">Внести</button>' : "") + "</div>";
    });
    if (missed.length > 3) h += '<div class="gwarn">…и ещё ' + (missed.length - 3) + " " + plural(missed.length - 3, "смена", "смены", "смен") + "</div>";
    return h + up + (g.at ? '<div class="note center">Обновлён ' + g.at + " с фото</div>" : "") + "</section>";
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

    var h = '<section class="sec">' + navHead(d, m) +
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
  function formTotal(v, r) { return r ? shiftTotal(v, r) : null; }
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

  function navHead(d, m) {   // «‹ Ноябрь 2026 ›» — текущий и прошлый месяц (D-42)
    var isCur = m.key === "cur";
    return '<div class="calhead">' +
      '<button type="button" data-nav="prev" aria-label="Прошлый месяц"' + (isCur && d.cal.length > 1 ? "" : " disabled") + ">‹</button>" +
      "<b>" + cap(MONTHS[m.month]) + " " + m.year + "</b>" +
      '<button type="button" data-nav="cur" aria-label="Текущий месяц"' + (isCur ? " disabled" : "") + ">›</button></div>";
  }

  /* ---------- «👤 Профиль» (план 016, G-008 а) ---------- */
  function readProfile(v) {
    var a = String(v || "").split(",");
    if (a.length !== 28) return null;
    function b(x) { return x === "" ? null : parseInt(x, 36); }
    function day(x) { return /^\d{8}$/.test(x) ? x.slice(6, 8) + "." + x.slice(4, 6) + "." + x.slice(0, 4) : null; }
    var p = { first: day(a[0]), n: b(a[1]), hours: num(a[2]), gross: b(a[3]), net: b(a[4]), avgShift: b(a[5]), avgMonth: b(a[6]),
      reg: b(a[7]), as: b(a[8]), ab: b(a[9]), mp: b(a[10]), me: b(a[11]),
      packs: a.slice(12, 18).map(b), bestDay: day(a[18]), best: b(a[19]), mostDay: day(a[20]), most: b(a[21]),
      bestMonth: /^\d{6}$/.test(a[22]) ? { y: +a[22].slice(0, 4), m: +a[22].slice(4, 6) } : null, bestMonthSum: b(a[23]),
      paidN: b(a[24]), paidOk: b(a[25]), paidDiff: num(a[26]), gemini: a[27] === "1" };
    var must = [p.n, p.hours, p.gross, p.net, p.avgShift, p.reg, p.as, p.ab, p.mp, p.me, p.paidN, p.paidOk, p.paidDiff];
    if (must.some(function (x) { return x === null || isNaN(x); }) || p.packs.some(function (x) { return x === null || isNaN(x); })) return null;
    return p;
  }
  // пороги достижений (план 016): самое большое полученное — цветом, следующее — «ещё N»
  var GOALS = [["🎯", [100, 200, 300, 500, 1000], "смен", ["смена", "смены", "смен"]],
    ["🔥", [1000, 5000, 10000, 25000, 50000, 100000], "выдач", ["выдача", "выдачи", "выдач"]],
    ["📦", [1000, 5000, 10000, 25000], "посылок", ["посылка", "посылки", "посылок"]]];
  function badges(vals) {
    var out = [];
    GOALS.forEach(function (g, k) {
      var v = vals[k], got = null, next = null;
      g[1].forEach(function (t) { if (v >= t) got = t; else if (next === null) next = t; });
      if (got !== null) out.push('<span class="got">' + g[0] + " " + fmt(got) + " " + g[2] + "</span>");
      if (next !== null) out.push("<span>" + g[0] + " " + fmt(next) + " " + g[2] + " · ещё " + fmt(next - v) + "</span>");
    });
    return '<div class="badges">' + out.join("") + "</div>";
  }
  function tgUser() {
    try { return (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || null; } catch (e) { return null; }
  }
  function initials(name) {
    var w = String(name || "").trim().split(/\s+/).filter(Boolean);
    return w.length ? (w[0].charAt(0) + (w[1] ? w[1].charAt(0) : "")).toUpperCase() : "👤";
  }
  function profileBlock(d) {
    var p = d.pf;
    if (!p) {
      return '<section class="sec"><div class="sub">В этом снимке профиля ещё нет. Откройте Mini App кнопкой «📊 Payday» у поля ' +
        "ввода — профиль появится и сохранится в снимок.</div></section>";
    }
    var u = tgUser(), tgName = u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "";
    var title = tgName || d.nm || "Вы", sub = [];
    if (u && u.username) sub.push("@" + u.username);
    sub.push(d.nm ? "в таблице «" + d.nm + "»" : "имя в таблице не задано — /name");
    var since = p.n ? "С " + p.first + " · " + fmt(p.n) + " " + plural(p.n, "смена", "смены", "смен") + " · " + nice(p.hours) + " ч"
      : "Смен пока нет";
    var photo = u && /^https:\/\//.test(u.photo_url || "") ? '<img src="' + esc(u.photo_url) + '" alt="">' : esc(initials(title));
    var h = '<section class="sec hero"><div class="av" aria-hidden="true">' + photo + "</div><div><b>" + esc(title) + "</b>" +
      "<small>" + esc(sub.join(" · ")) + "</small><small>" + esc(since) + "</small></div></section>";
    h += schedBlock(d);   // план 019: между «Вы» и «Заработано»
    var issued = p.reg + p.mp + p.me, packs = p.packs.reduce(function (a, x) { return a + x; }, 0);
    var settings = '<section class="sec"><div class="cap">⚙️ Настройки</div>' +
      '<div class="row2"><span>Часы смены по умолчанию</span><b>' + nice(d.dh) + "</b></div>" +
      '<div class="row2"><span>Ключ Gemini для фото</span><b>' + (p.gemini ? "есть ✓" : "нет") + "</b></div>" +
      '<div class="note">Поменять — в боте: /name, /hours, /gemini</div></section>';
    var goals = '<section class="sec"><div class="cap">Достижения</div>' + badges([p.n, issued, packs]) + "</section>";
    if (!p.n && !packs) {
      return h + '<section class="sec"><div class="sub">Профиль заполнится после первой смены: заработок, выдачи, посылки, рекорды.</div></section>' +
        goals + settings;
    }
    h += '<section class="sec"><div class="cap">Заработано за всё время</div>' +
      '<div class="money"><b>' + fmt(p.gross) + '</b> <span class="sub">грн грязными</span></div>' +
      '<div class="sub"><b>' + fmt(p.net) + " грн</b> чистыми</div>" +
      '<div class="row2"><span class="sub">Средняя смена</span><b>' + fmt(p.avgShift) + " грн</b></div>" +
      (p.avgMonth !== null ? '<div class="row2"><span class="sub">Средний месяц</span><b>' + fmt(p.avgMonth) + " грн</b></div>" : "") +
      "</section>";
    h += '<section class="sec"><div class="cap">Выдачи · всего ' + fmt(issued) + " (обычн. + МП + МЕ)</div><div class=\"tiles\">" +
      tile(p.reg, "обычные") + tile(p.mp, "МП") + tile(p.me, "МЕ") +
      tile(p.as + p.ab, "алко-чеки · " + fmt(p.as) + " &lt;100 · " + fmt(p.ab) + " &gt;100") + "</div></section>";
    var k = p.packs;
    h += '<section class="sec"><div class="cap">📦 Посылки · всего ' + fmt(packs) + '</div><div class="tiles t3">' +
      tile(k[0] + k[1], "приём от клиента") + tile(k[2] + k[3], "приём от курьера") + tile(k[4] + k[5], "выдано курьеру") +
      '</div><div class="note">Meest ' + fmt(k[0] + k[2] + k[4]) + " · Мерчант " + fmt(k[1] + k[3] + k[5]) + "</div></section>";
    if (p.n) {
      h += '<section class="sec"><div class="cap">🏆 Рекорды</div>' +
        '<div class="row2"><span>Лучшая смена · ' + p.bestDay + "</span><b>" + fmt(p.best) + " грн</b></div>" +
        '<div class="row2"><span>Больше всего выдач · ' + p.mostDay + "</span><b>" + fmt(p.most) + "</b></div>" +
        (p.bestMonth ? '<div class="row2"><span>Лучший месяц · ' + MONTHS[p.bestMonth.m] + " " + p.bestMonth.y + "</span><b>" +
          fmt(p.bestMonthSum) + " грн</b></div>" : "") + "</section>";
    }
    if (p.paidN) {
      var dd = p.paidDiff;
      h += '<section class="sec"><div class="cap">💳 Сверка с картой</div>' +
        '<div class="row2"><span>Сошлось</span><b>' + p.paidOk + " из " + p.paidN + " " + plural(p.paidN, "месяца", "месяцев", "месяцев") + "</b></div>" +
        '<div class="row2"><span>Общая разница</span><b class="' + (dd > 0.5 ? "up" : dd < -0.5 ? "down" : "") + '">' +
        (Math.abs(dd) < 0.5 ? "±0" : signed(dd)) + " грн</b></div></section>";
    }
    return h + goals + settings;
  }
  function tile(v, label) { return '<div class="tile"><b>' + fmt(v) + "</b><small>" + label + "</small></div>"; }

  /* ---------- вкладки управления (план 015, G-006 а) ---------- */
  var TABS = [["stat", "📊", "Статистика"], ["rates", "💰", "Тарифы"], ["packs", "📦", "Посылки"], ["hours", "⏱", "Часы"],
    ["profile", "👤", "Профиль"]];
  var SHIFT_RATES = [["hourly", "Ставка за час"], ["regular", "Обычная выдача"], ["alco_small", "Алко-чек <100"],
    ["alco_big", "Алко-чек >100"], ["mp", "МП"], ["me", "МЕ"]];          // порядок r
  var PACK_RATES = [["pk_in_meest", "Приём Meest", "от клиента"], ["pk_in_merchant", "Приём Мерчант", "от клиента"],
    ["pk_cin_meest", "От курьера Meest"], ["pk_cin_merchant", "От курьера Мерчант"],
    ["pk_cout_meest", "Курьеру Meest"], ["pk_cout_merchant", "Курьеру Мерчант"]];   // порядок q и kk (calc.PACK_KEYS)
  var RATE_KEYS = SHIFT_RATES.concat(PACK_RATES).map(function (x) { return x[0]; });

  function tabsBar() {
    return '<nav class="tabs" role="tablist" aria-label="Разделы">' + TABS.map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '">' +
        '<span aria-hidden="true">' + t[1] + "</span>" + t[2] + "</button>";
    }).join("") + "</nav>";
  }
  function noBot(d) { return d.bot ? "" : '<div class="note">Сохранять можно, когда страница открыта из бота.</div>'; }
  function isoAdd(iso, days) {
    var p = iso.split("-"), t = new Date(+p[0], +p[1] - 1, +p[2] + days);
    return t.getFullYear() + "-" + two(t.getMonth() + 1) + "-" + two(t.getDate());
  }

  // «💰 Тарифы»: нажали тариф — новая цена и с какого дня (сегодня · с 1-го · другая дата)
  function rateSince(d) {
    var e = state.rate;
    return e.since === "first" ? d.date.slice(0, 8) + "01" : e.since === "other" ? e.other : d.date;
  }
  function rateLabel(e) {
    var row = SHIFT_RATES.concat(PACK_RATES).filter(function (x) { return x[0] === e.key; })[0];
    return row ? row[1] : e.key;
  }
  function rateSaveText(d) {
    var e = state.rate, since = rateSince(d);
    return "Сохранить: " + rateLabel(e) + " " + (isFinite(e.price) ? nice(e.price) : "—") + " грн" + (since ? " с " + ddmm(since) : "");
  }
  function rateRows(d, rows, vals) {
    return rows.map(function (x, k) {
      var cur = vals ? vals[k] : null, open = state.rate && state.rate.key === x[0];
      var h = '<button type="button" class="li" data-rate="' + x[0] + '" aria-expanded="' + !!open + '"><span>' + esc(x[1]) +
        (x[2] ? "<small>" + esc(x[2]) + "</small>" : "") + '</span><span class="v">' +
        (cur !== null ? nice(cur) + (x[0] === "hourly" ? " грн/ч" : " грн") : "—") + "</span></button>";
      if (open) h += rateEdit(d, cur);
      return h;
    }).join("");
  }
  function rateEdit(d, cur) {
    var e = state.rate, first = d.date.slice(0, 8) + "01";
    var py = d.year, pm = d.month - 1;
    if (pm < 1) { pm = 12; py -= 1; }
    var chips = [["today", "Сегодня · " + ddmm(d.date)], ["first", "С 1-го · " + ddmm(first)], ["other", "Другая…"]];
    return '<div class="edit"><div class="cap">Сейчас ' + (cur !== null ? nice(cur) + " грн" : "—") + "</div>" +
      '<label>Новая цена <input id="rate-price" type="number" inputmode="decimal" min="0" max="100000" step="0.01" value="' +
      (isFinite(e.price) ? e.price : "") + '"></label>' +
      '<div class="cap" style="margin-top:10px">С какого дня</div><div class="chips" role="group" aria-label="С какого дня">' +
      chips.map(function (c) {
        return '<button type="button" data-since="' + c[0] + '" aria-pressed="' + (e.since === c[0]) + '">' + c[1] + "</button>";
      }).join("") + "</div>" +
      (e.since === "other" ? '<input id="rate-date" class="date" type="date" min="' + py + "-" + two(pm) + '-01" max="' +
        isoAdd(d.date, 366) + '" value="' + esc(e.other || "") + '" aria-label="Дата">' : "") +
      '<button type="button" class="btn main" id="rate-save" data-act="rate-save"' + (d.bot ? "" : " disabled") + ">" +
      esc(rateSaveText(d)) + "</button>" +
      '<button type="button" class="more" data-act="rate-cancel">Отмена</button>' +
      '<div class="note">Откроется чат — бот покажет «💰 Записать…?», сохраняет по ✅. Смены с этого дня пересчитаются.</div></div>';
  }
  function ratesBlock(d) {
    var cur = d.cal[d.cal.length - 1];
    if (!cur.rates) return '<section class="sec"><div class="note">Тарифов в ссылке нет — откройте страницу заново из бота.</div></section>';
    return '<section class="sec"><div class="cap">Смена · на ' + esc(ddmm(d.date)) + "</div>" + rateRows(d, SHIFT_RATES, cur.rates) +
      "</section>" + '<section class="sec"><div class="cap">📦 Приём и курьер · на ' + esc(ddmm(d.date)) + "</div>" +
      rateRows(d, PACK_RATES, cur.q) + "</section>" + noBot(d);
  }
  function rateParam(key, price, iso) {
    if (RATE_KEYS.indexOf(key) < 0 || !(price >= 0 && price <= 100000)) return null;
    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!dm) return null;
    return "rate_" + key + "_" + String(Math.round(price * 100) / 100).replace(".", "-") + "_" + dm[1] + dm[2] + dm[3];
  }

  // «📦 Посылки»: −/+ или число по каждой графе за показанный месяц; в бот уходит разница (план 015)
  function packVals(m) {
    if (!state.packs[m.key]) state.packs[m.key] = m.kk.slice();
    return state.packs[m.key];
  }
  function packSummary(m) {
    var v = packVals(m), lines = [], count = 0, money = 0;
    PACK_RATES.forEach(function (x, k) {
      var dlt = v[k] - m.kk[k];
      count += v[k];
      money += v[k] * (m.q ? m.q[k] : 0);
      if (dlt) lines.push('<div class="row2"><span>' + esc(x[1]) + " (" + m.kk[k] + " → " + v[k] + ')</span><b class="' +
        (dlt > 0 ? "up" : "down") + '">' + signed(dlt) + "</b></div>");
    });
    return (lines.length ? '<div class="cap" style="margin-top:8px">Изменено</div>' + lines.join("") : "") +
      '<div class="row2"><span>Итого за ' + MONTHS[m.month] + "</span><b>" + fmt(count) + " " +
      plural(count, "посылка", "посылки", "посылок") + " · " + fmt(money) + " грн</b></div>";
  }
  function packDeltas(m) { var v = packVals(m); return v.map(function (x, k) { return x - m.kk[k]; }); }
  function packsBlock(d) {
    var m = shown();
    var h = '<section class="sec">' + navHead(d, m) + "</section>";
    if (!m.kk) return h + '<section class="sec"><div class="note">Посылок в ссылке нет — откройте страницу заново из бота.</div></section>';
    var v = packVals(m), changed = packDeltas(m).some(Boolean);
    h += '<section class="sec">' + PACK_RATES.map(function (x, k) {
      var rate = m.q ? nice(m.q[k]) + " грн" : "";
      return '<div class="step"><span>' + esc(x[1]) + "<small>" + (x[2] ? esc(x[2]) + " · " : "") + rate + "</small></span>" +
        '<span class="ctl"><button type="button" data-pstep="' + k + '" data-d="-1" aria-label="Меньше">−</button>' +
        '<input class="wide" type="number" inputmode="numeric" min="0" max="99999" step="1" data-pk="' + k + '" value="' + v[k] +
        '" aria-label="' + esc(x[1]) + '">' +
        '<button type="button" data-pstep="' + k + '" data-d="1" aria-label="Больше">+</button></span></div>';
    }).join("") + '<div id="pk-sum">' + packSummary(m) + "</div>" +
      '<button type="button" class="btn main" id="pk-save" data-act="packs-save"' + (changed && d.bot ? "" : " disabled") +
      ">Сохранить изменения</button>" +
      '<button type="button" class="more" data-act="packs-reset"' + (changed ? "" : " disabled") + ">Вернуть как было</button>" +
      '<div class="note">Откроется чат — бот покажет, что изменится, записывает по ✅.</div></section>';
    return h + noBot(d);
  }
  function packsParam(m, deltas) {
    if (deltas.length !== 6 || !deltas.some(Boolean) ||
        !deltas.every(function (x) { return Math.floor(x) === x && Math.abs(x) <= 99999; })) return null;
    return "pk_" + m.year + two(m.month) + "_" + deltas.join("_");
  }

  // «⏱ Часы»: часы за месяц итогом; «Считать по сменам» — вернуть часы из смен
  function shiftHours(m) { return m.shifts.reduce(function (a, s) { return a + s.h; }, 0); }
  function hoursVal(m) {
    if (state.hours[m.key] === undefined) {
      var mh = m.card && m.card.mh;
      state.hours[m.key] = mh !== null && mh !== undefined ? mh : Math.round(shiftHours(m) * 100) / 100;
    }
    return state.hours[m.key];
  }
  function hoursMoney(m) {
    var v = hoursVal(m), rate = m.rates ? m.rates[0] : null;
    return rate === null ? "—" : nice(v) + " × " + nice(rate) + " = " + fmt(v * rate) + " грн";
  }
  function hoursSaveText(m) { return "Сохранить: " + nice(hoursVal(m)) + " ч за " + MONTHS[m.month]; }
  function hoursBlock(d) {
    var m = shown(), mh = m.card && m.card.mh, entered = mh !== null && mh !== undefined, sh = shiftHours(m);
    return '<section class="sec">' + navHead(d, m) + "</section>" +
      '<section class="sec"><div class="cap">⏱ Часы за ' + MONTHS[m.month] + " · сейчас " +
      (entered ? nice(mh) + " — введено вами" : nice(sh) + " — по сменам") + "</div>" +
      '<div class="edit"><label>Всего часов <input id="hours-input" type="number" inputmode="decimal" min="0" max="744" step="0.5" value="' +
      hoursVal(m) + '"></label></div>' +
      '<div class="row2"><span>За часы станет</span><b id="hours-money">' + hoursMoney(m) + "</b></div>" +
      '<button type="button" class="btn main" id="hours-save" data-act="hours-save"' + (d.bot ? "" : " disabled") + ">" +
      esc(hoursSaveText(m)) + "</button>" +
      (entered ? '<button type="button" class="more" data-act="hours-clear"' + (d.bot ? "" : " disabled") +
        ">Считать по сменам (" + nice(sh) + " ч)</button>" : "") +
      '<div class="note">Откроется чат — бот покажет «⏱ Записать…?», сохраняет по ✅.</div></section>' + noBot(d);
  }
  function hoursParam(m, h) {
    if (h === null) return "mh_" + m.year + two(m.month) + "_c";
    if (!(h >= 0 && h <= 744)) return null;
    return "mh_" + m.year + two(m.month) + "_" + String(Math.round(h * 100) / 100).replace(".", "-");
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
    if (state.stale) {   // открыли с ярлыка или из профиля бота — снимок из облака Telegram (планы 014, 015)
      var t = new Date(state.stale);
      h += '<div class="stale">Цифры на ' + two(t.getDate()) + "." + two(t.getMonth() + 1) + ", " + two(t.getHours()) + ":" +
        two(t.getMinutes()) + " · свежие — кнопка «📊 Payday» у поля ввода</div>";
    }
    h += tabsBar();   // план 015, G-006 а
    if (state.tab === "rates") return h + ratesBlock(d);
    if (state.tab === "packs") return h + packsBlock(d);
    if (state.tab === "hours") return h + hoursBlock(d);
    if (state.tab === "profile") return h + profileBlock(d);
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
      '<div class="sub">Нажмите кнопку «📊 Payday» у поля ввода в чате с ботом — цифры приходят вместе с ней.</div></section>';
  }

  function go(bot, what) {
    var link = "https://t.me/" + bot + "?start=" + what;
    if (tg && tg.openTelegramLink) { tg.openTelegramLink(link); tg.close(); } else { window.location.href = link; }
  }

  var app = document.getElementById("app");
  var hash = window.location.hash;
  var data = readData(parseHash(hash));
  var state = { unit: "money", view: "cur", sel: {}, dayOpen: false, monthOpen: false, form: null, payOpen: null,
    stale: null, homeOk: false, tab: "stat", rate: null, packs: {}, hours: {}, gview: "cur" };
  function shown() { return data.cal[state.view === "prev" && data.cal.length > 1 ? 0 : data.cal.length - 1]; }
  function draw() { app.innerHTML = data ? render(data) : emptyView(); }
  function haptic() { try { if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged(); } catch (e) { /* нет — не важно */ } }
  function vibe() { try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light"); } catch (e) { /* нет */ } }

  function openForm(m, day) {
    var s = m.shifts.filter(function (x) { return x.d === day; })[0];
    state.form = { key: m.key, day: day,   // план 019: часы новой смены — из графика на этот день (D-51)
      vals: s ? { r: s.r, as: s.as, ab: s.ab, mp: s.mp, me: s.me, h: s.h }
        : { r: 0, as: 0, ab: 0, mp: 0, me: 0, h: schedHours(data, m, day) || data.dh } };
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
    if (b.dataset.tab) { state.tab = b.dataset.tab; state.rate = null; haptic(); draw(); window.scrollTo(0, 0); }
    else if (b.dataset.rate) {   // план 015: «💰 Тарифы» — открыть / закрыть правку тарифа
      var key = b.dataset.rate, cur = data.cal[data.cal.length - 1], k = RATE_KEYS.indexOf(key);
      var vals = k < 6 ? cur.rates : cur.q, now = vals ? vals[k % 6] : NaN;
      state.rate = state.rate && state.rate.key === key ? null : { key: key, price: now, since: "today", other: data.date };
      haptic();
      draw();
      var pin = document.getElementById("rate-price");
      if (pin) { pin.focus(); pin.select(); }
    }
    else if (b.dataset.since) { state.rate.since = b.dataset.since; draw(); }
    else if (act === "rate-cancel") { state.rate = null; draw(); }
    else if (act === "rate-save") {
      var rp = rateParam(state.rate.key, state.rate.price, rateSince(data));
      if (!rp) { alertMsg("Проверьте цену (0–100 000) и дату."); return; }
      vibe();
      go(data.bot, rp);
    }
    else if (b.dataset.pstep) {   // «📦 Посылки»: −/+
      var pv = packVals(m), pk = +b.dataset.pstep;
      pv[pk] = Math.max(0, Math.min(99999, pv[pk] + +b.dataset.d));
      var pinp = app.querySelector('input[data-pk="' + pk + '"]');
      if (pinp) pinp.value = pv[pk];
      updatePacks(m);
      haptic();
    }
    else if (act === "packs-reset") { state.packs[m.key] = null; draw(); }
    else if (act === "packs-save") {
      var kp = packsParam(m, packDeltas(m));
      if (!kp) { alertMsg("Проверьте числа: целые от 0 до 99 999."); return; }
      vibe();
      go(data.bot, kp);
    }
    else if (act === "hours-save" || act === "hours-clear") {
      var hp = hoursParam(m, act === "hours-clear" ? null : hoursVal(m));
      if (!hp) { alertMsg("Часы — от 0 до 744."); return; }
      vibe();
      go(data.bot, hp);
    }
    else if (b.dataset.gnav) { state.gview = b.dataset.gnav; haptic(); draw(); }   // план 019: ‹ › в «📅 Мой график»
    else if (b.dataset.gfix) {   // «Внести» пропущенную смену — форма на этот день в календаре «📊 Статистики»
      var fd = +b.dataset.gfix, cm = data.cal[data.cal.length - 1];
      state.tab = "stat"; state.view = "cur"; state.sel.cur = fd; state.payOpen = null;
      openForm(cm, fd);
      haptic();
      draw();
      var cal = app.querySelector(".cal");
      if (cal) cal.scrollIntoView({ block: "start" });
    }
    else if (b.dataset.unit) { state.unit = b.dataset.unit; draw(); }
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
    var el = e.target, v = Number(el.value), m = data && shown();
    if (el.id === "rate-price" && state.rate) {   // план 015: без перерисовки — чтобы не терять фокус
      state.rate.price = el.value === "" ? NaN : v;
      setText("rate-save", rateSaveText(data));
      return;
    }
    if (el.id === "rate-date" && state.rate) { state.rate.other = el.value; setText("rate-save", rateSaveText(data)); return; }
    if (el.dataset && el.dataset.pk !== undefined && m) {
      packVals(m)[+el.dataset.pk] = isFinite(v) && v >= 0 ? Math.min(99999, Math.floor(v)) : 0;
      updatePacks(m);
      return;
    }
    if (el.id === "hours-input" && m) {
      state.hours[m.key] = isFinite(v) && v >= 0 ? v : 0;
      var hm = document.getElementById("hours-money");
      if (hm) hm.textContent = hoursMoney(m);
      setText("hours-save", hoursSaveText(m));
      return;
    }
    var f = el.dataset && el.dataset.field;
    if (!f || !state.form) return;
    state.form.vals[f] = isFinite(v) && v >= 0 ? v : 0;
    updateTotal();
  });
  function setText(id, text) { var x = document.getElementById(id); if (x) x.textContent = text; }
  function updatePacks(m) {
    var sum = document.getElementById("pk-sum"), changed = packDeltas(m).some(Boolean);
    if (sum) sum.innerHTML = packSummary(m);
    var sv = document.getElementById("pk-save");
    if (sv) sv.disabled = !changed || !data.bot;
    var rs = app.querySelector('[data-act="packs-reset"]');
    if (rs) rs.disabled = !changed;
  }
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
  window.PaydayMiniApp = { parseHash: parseHash, readData: readData, shifts: shifts, shiftParam: shiftParam, payParam: payParam,
    rateParam: rateParam, packsParam: packsParam, hoursParam: hoursParam, readProfile: readProfile, readSched: readSched,
    b64text: b64text };
})();
