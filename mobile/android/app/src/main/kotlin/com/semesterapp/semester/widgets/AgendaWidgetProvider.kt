package com.semesterapp.semester.widgets

import com.semesterapp.semester.R

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

/// "Semester — Up next": homework, tasks and events of the coming days
class AgendaWidgetProvider : SemesterWidgetProvider() {
    override fun render(
        context: Context,
        prefs: SharedPreferences,
        dark: Boolean,
    ): RemoteViews {
        val c = colors(dark)
        val views = RemoteViews(context.packageName, R.layout.agenda_widget)
        views.setInt(R.id.widget_root, "setBackgroundResource", if (dark) R.drawable.widget_bg_dark else R.drawable.widget_bg_light)
        views.setTextColor(R.id.widget_title, c.title)
        views.setTextColor(R.id.widget_meta, c.soft)

        val payload = payload(prefs, "agenda")
        val items = payload.optJSONArray("items") ?: JSONArray()
        val total = payload.optInt("total", 0)

        views.setTextViewText(R.id.widget_title, "Up next")
        views.setTextViewText(
            R.id.widget_meta,
            if (total > items.length()) "+${total - items.length()} more" else "",
        )
        views.removeAllViews(R.id.rows)

        if (items.length() == 0) {
            views.addView(R.id.rows, itemRow(context, c, "", "Nothing coming up", "", false))
            views.setOnClickPendingIntent(R.id.widget_root, openApp(context, "overview"))
            return views
        }

        for (i in 0 until items.length()) {
            val item = items.getJSONObject(i)
            views.addView(
                R.id.rows,
                itemRow(
                    context, c,
                    tag = item.optString("tag"),
                    title = item.optString("title"),
                    meta = item.optString("meta"),
                    overdue = item.optBoolean("overdue"),
                ),
            )
        }
        views.setOnClickPendingIntent(R.id.widget_root, openApp(context, "tasks"))
        return views
    }

    private fun itemRow(
        context: Context,
        c: Colors,
        tag: String,
        title: String,
        meta: String,
        overdue: Boolean,
    ): RemoteViews {
        val row = RemoteViews(context.packageName, R.layout.widget_agenda_item)
        row.setTextViewText(R.id.item_tag, tag)
        row.setTextColor(R.id.item_tag, if (overdue) c.marker else c.accent)
        row.setTextViewText(R.id.item_title, title)
        row.setTextColor(R.id.item_title, if (overdue) c.marker else c.title)
        row.setTextViewText(R.id.item_meta, meta)
        row.setTextColor(R.id.item_meta, if (overdue) c.marker else c.soft)
        return row
    }
}
