package com.semesterapp.semester.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONObject

/// shared plumbing for the home-screen widgets: reads the payloads the
/// Flutter side writes through the home_widget plugin into
/// "HomeWidgetPreferences" and hands out colors matching the app themes
abstract class SemesterWidgetProvider : AppWidgetProvider() {
    protected data class Colors(
        val bg: Int,
        val title: Int,
        val soft: Int,
        val accent: Int,
        val marker: Int,
    )

    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val prefs = context.getSharedPreferences("HomeWidgetPreferences", Context.MODE_PRIVATE)
        val dark = prefs.getBoolean("dark", true)
        for (id in appWidgetIds) {
            manager.updateAppWidget(id, render(context, prefs, dark))
        }
    }

    abstract fun render(context: Context, prefs: SharedPreferences, dark: Boolean): RemoteViews

    protected fun colors(dark: Boolean): Colors =
        if (dark) {
            Colors(
                bg = 0xFF1E1B14.toInt(),
                title = 0xFFECE6D6.toInt(),
                soft = 0xFFA29A88.toInt(),
                accent = 0xFF8FB99A.toInt(),
                marker = 0xFFE08A63.toInt(),
            )
        } else {
            Colors(
                bg = 0xFFFAF8F1.toInt(),
                title = 0xFF26221B.toInt(),
                soft = 0xFF756E60.toInt(),
                accent = 0xFF31633F.toInt(),
                marker = 0xFFC14B26.toInt(),
            )
        }

    /// tapping a widget opens the app on the matching tab via deeplink
    protected fun openApp(context: Context, route: String): PendingIntent =
        PendingIntent.getActivity(
            context,
            route.hashCode(),
            Intent(Intent.ACTION_VIEW, Uri.parse("semester://$route"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    protected fun payload(prefs: SharedPreferences, key: String): JSONObject =
        JSONObject(prefs.getString(key, "{}") ?: "{}")
}
