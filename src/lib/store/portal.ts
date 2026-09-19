"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PortalSub } from "@/lib/server/portal";
import type { PortalPlan } from "@/lib/server/portal";
import { hashId } from "../utils";

/** stable cloud row ids — content-derived so both clients agree */
export const portalSubRowId = (s: PortalSub) =>
  hashId(
    [s.date, s.weekday, s.period, s.course, s.courseOld ?? "", s.substitute, s.room, s.info, String(s.cancelled)].join("|"),
  );
export const portalCourseRowId = (course: string) => hashId(`course|${course}`);

/**
 * School portal settings + the last fetched substitute plan.
 * Device-local ONLY: credentials never leave this browser (or get synced),
 * they are sent per-request to your own server for the portal login.
 */

interface PortalState {
  baseUrl: string;
  username: string;
  password: string;
  autoFetch: boolean;
  data: PortalPlan | null;
  lastFetched: number | null;
  error: string | null;

  setSettings: (s: { baseUrl: string; username: string; password: string; autoFetch: boolean }) => void;
  setData: (data: PortalPlan) => void;
  setError: (error: string | null) => void;
  clearData: () => void;
  /** row-level sync ops (structured portal tables) */
  upsertSub: (sub: PortalSub) => void;
  removeSub: (rowId: string) => void;
  upsertCourse: (course: string) => void;
  removeCourse: (rowId: string) => void;
}

export const usePortalStore = create<PortalState>()(
  persist(
    (set) => ({
      baseUrl: "https://evbspar.eltern-portal.org",
      username: "",
      password: "",
      autoFetch: true,
      data: null,
      lastFetched: null,
      error: null,
      setSettings: (s) => set(s),
      setData: (data) => set({ data, lastFetched: Date.now(), error: null }),
      setError: (error) => set({ error }),
      clearData: () => set({ data: null, lastFetched: null }),
      upsertSub: (sub) =>
        set((s) => {
          if (!s.data) return s;
          const rowId = portalSubRowId(sub);
          const days = s.data.days.map((d) => ({ ...d, entries: [...d.entries] }));
          let day = days.find((d) => d.date === sub.date);
          if (!day) {
            day = { date: sub.date, weekday: sub.weekday, entries: [] };
            days.push(day);
          }
          day.entries = [...day.entries.filter((e) => portalSubRowId(e) !== rowId), sub];
          return { data: { ...s.data, days } };
        }),
      removeSub: (rowId) =>
        set((s) => {
          if (!s.data) return s;
          const days = s.data.days.map((d) => ({
            ...d,
            entries: d.entries.filter((e) => portalSubRowId(e) !== rowId),
          }));
          return { data: { ...s.data, days } };
        }),
      upsertCourse: (course) =>
        set((s) => {
          if (!s.data) return s;
          return {
            data: {
              ...s.data,
              courses: s.data.courses.includes(course) ? s.data.courses : [...s.data.courses, course],
            },
          };
        }),
      removeCourse: (rowId) =>
        set((s) => {
          if (!s.data) return s;
          return {
            data: {
              ...s.data,
              courses: s.data.courses.filter((c) => portalCourseRowId(c) !== rowId),
            },
          };
        }),
    }),
    { name: "semester.portal", version: 1 },
  ),
);
