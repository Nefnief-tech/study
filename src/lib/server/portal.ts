/* Eltern-Portal (art soft) fetcher + Vertretungsplan HTML parser.
 * Server-side only: performs the CSRF login dance and scrapes the plan. */

export interface PortalSub {
  date: string; // 18.09.2026
  weekday: string; // Fr
  period: string; // "1"
  substitute: string; // "" when nobody steps in
  course: string;
  courseOld?: string; // original course when it was swapped
  room: string;
  info: string;
  cancelled: boolean;
}

export interface PortalDay {
  date: string;
  weekday: string;
  entries: PortalSub[];
}

export interface PortalPlan {
  days: PortalDay[];
  /** the student's course codes ("Mitglied in Kursen") */
  courses: string[];
  stand: string | null;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
};

function decode(s: string) {
  return s.replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m).replace(/&#\d+;/g, " ");
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, " ");
}

function clean(s: string) {
  return decode(s).replace(/\s+/g, " ").trim();
}

export class PortalAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalAuthError";
  }
}

export async function fetchPortalPlan(
  baseUrl: string,
  username: string,
  password: string,
): Promise<PortalPlan> {
  const base = baseUrl.replace(/\/+$/, "");
  const jar: Record<string, string> = {};
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  const absorb = (res: Response) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  };
  const UA = "SemesterApp/1.0 (personal study planner)";

  // 1. login page → CSRF token + session cookie
  const r1 = await fetch(`${base}/`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  absorb(r1);
  const loginHtml = await r1.text();
  const csrf =
    loginHtml.match(/name='csrf' value='([^']*)'/)?.[1] ??
    loginHtml.match(/name="csrf" value="([^"]*)"/)?.[1];
  if (!csrf) throw new Error("Could not find the login form (wrong portal URL?).");

  // 2. credentials → session
  const r2 = await fetch(`${base}/includes/project/auth/login.php`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
      "user-agent": UA,
    },
    body: new URLSearchParams({ csrf, username, password, go_to: "" }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  absorb(r2);

  // 3. the plan (a logged-out fetch lands back on the login form)
  const r3 = await fetch(`${base}/service/vertretungsplan`, {
    headers: { cookie: cookieHeader(), "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  absorb(r3);
  const html = await r3.text();
  if (r3.status !== 200 || html.includes("form-signin")) {
    throw new PortalAuthError("Portal rejected the login — check URL, email and password.");
  }
  return parseVertretungsplan(html);
}

export function parseVertretungsplan(html: string): PortalPlan {
  const days: PortalDay[] = [];

  const blockRe =
    /<div class='list bold full_width text_center'>([^<]+)<\/div>\s*<table[^>]*>([\s\S]*?)<\/table>/g;
  const rowRe = /<tr class='liste_(?:grau|weiss)'>([\s\S]*?)<\/tr>/g;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;

  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(html)) !== null) {
    const header = decode(block[1]);
    const dm = header.match(/(\w{2})\.,\s*(\d{2}\.\d{2}\.\d{4})/);
    const weekday = dm?.[1] ?? "";
    const date = dm?.[2] ?? header.trim();

    const entries: PortalSub[] = [];
    let row: RegExpExecArray | null;
    while ((row = rowRe.exec(block[2])) !== null) {
      const cells: string[] = [];
      let cell: RegExpExecArray | null;
      cellRe.lastIndex = 0;
      while ((cell = cellRe.exec(row[1])) !== null) cells.push(cell[1]);
      if (cells.length < 5) continue;

      const period = decode(cells[0]).replace(/\./g, "").trim();
      const substitute = decode(stripTags(cells[1])).replace(/\s+/g, " ").trim();

      // course cell: `<span line-through>old</span> new` when a course was swapped
      let courseOld: string | undefined;
      let courseHtml = cells[2];
      const span = courseHtml.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
      if (span) {
        courseOld = clean(span[1]);
        courseHtml = courseHtml.replace(/<span[^>]*>[\s\S]*?<\/span>/i, " ");
      }
      const course = clean(courseHtml);
      const room = decode(stripTags(cells[3])).replace(/\s+/g, " ").trim();
      const info = decode(stripTags(cells[4])).replace(/\s+/g, " ").trim();

      if (!course && !substitute && !info) continue;
      entries.push({
        date,
        weekday,
        period,
        substitute,
        course,
        courseOld: courseOld || undefined,
        room,
        info,
        cancelled: /entf/i.test(info),
      });
    }
    days.push({ date, weekday, entries });
  }

  // the student's own course codes
  const courses: string[] = [];
  const cm = html.match(/Mitglied in Kursen[\s\S]*?<td valign='top'>([\s\S]*?)<\/td>/);
  if (cm) {
    for (const part of cm[1].split(/<br\s*\/?>/i)) {
      const code = clean(part);
      if (code) courses.push(code);
    }
  }

  const stand = decode(html.match(/Stand:&nbsp;([^<</]+)</)?.[1] ?? "").trim() || null;

  return { days, courses, stand };
}
