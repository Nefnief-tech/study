package com.semesterapp.semester.widgets

import com.semesterapp.semester.R

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

/// "Semester — Timetable": today's lessons (period · subject · room)
class TimetableWidgetProvider : SemesterWidgetProvider() {
    override fun render(
        context: Context,
        prefs: SharedPreferences,
        dark: Boolean,
    ): RemoteViews {
        val c = colors(dark)
        val views = RemoteViews(context.packageName, R.layout.timetable_widget)
        views.setInt(R.id.widget_root, "setBackgroundResource", if (dark) R.drawable.widget_bg_dark else R.drawable.widget_bg_light)
        views.setTextColor(R.id.widget_title, c.title)
        views.setTextColor(R.id.widget_meta, c.soft)

        val payload = payload(prefs, "timetable")
        val items = payload.optJSONArray("items") ?: JSONArray()
        val day = payload.optString("day", "")

        views.setTextViewText(R.id.widget_title, "Timetable")
        views.setTextViewText(R.id.widget_meta, day)
        views.removeAllViews(R.id.rows)

        if (items.length() == 0) {
            views.addView(R.id.rows, row(context, c, period = "", subject = "No lessons today", room = "", time = ""))
            views.setOnClickPendingIntent(R.id.widget_root, openApp(context, "timetable"))
            return views
        }

        for (i in 0 until items.length()) {
            val item = items.getJSONObject(i)
            views.addView(
                R.id.rows,
                row(
                    context, c,
                    period = item.optString("period"),
                    subject = item.optString("subject"),
                    room = item.optString("room"),
                    time = item.optString("time"),
                ),
            )
        }
        views.setOnClickPendingIntent(R.id.widget_root, openApp(context, "timetable"))
        return views
    }

    private fun row(
        context: Context,
        c: Colors,
        period: String,
        subject: String,
        room: String,
        time: String,
    ): RemoteViews {
        val row = RemoteViews(context.packageName, R.layout.widget_timetable_item)
        row.setTextViewText(R.id.row_period, period)
        row.setTextColor(R.id.row_period, c.accent)
        row.setTextViewText(R.id.row_subject, subject)
        row.setTextColor(R.id.row_subject, c.title)
        val meta = listOf(time, room).filter { it.isNotEmpty() }.joinToString(" · ")
        row.setTextViewText(R.id.row_meta, meta)
        row.setTextColor(R.id.row_meta, c.soft)
        return row
    }
}
