package com.semesterapp.semester.widgets

import com.semesterapp.semester.R

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews

/// "Semester — Up next": homework, tasks and events of the coming days,
/// rendered as a scrollable list fed by WidgetDataService
class AgendaWidgetProvider : SemesterWidgetProvider() {
    override fun render(
        context: Context,
        prefs: SharedPreferences,
        dark: Boolean,
    ): RemoteViews {
        val c = colors(dark)
        val views = RemoteViews(context.packageName, R.layout.agenda_widget)
        views.setInt(R.id.widget_root, "setBackgroundResource", if (dark) R.drawable.widget_bg_dark else R.drawable.widget_bg_light)
        views.setTextViewText(R.id.widget_title, "UP NEXT")
        views.setTextColor(R.id.widget_title, c.accent)
        views.setInt(R.id.header_divider, "setBackgroundColor", c.divider)

        val total = payload(prefs, "agenda").optInt("total", 0)
        views.setTextViewText(R.id.widget_meta, if (total > 0) "$total items" else "")
        views.setTextColor(R.id.widget_meta, c.soft)

        views.setRemoteAdapter(R.id.rows, widgetDataService(context, "agenda"))
        views.setEmptyView(R.id.rows, R.id.empty)
        views.setOnClickPendingIntent(R.id.widget_root, openApp(context, "tasks"))
        return views
    }
}
