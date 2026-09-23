package com.semesterapp.semester.widgets

import com.semesterapp.semester.R

import android.content.Context
import android.graphics.Color
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import org.json.JSONObject

/// feeds the scrollable widget lists: reads the JSON payloads the Flutter
/// side writes into "HomeWidgetPreferences" and produces one row per entry.
/// The `kind` extra decides which payload/row-layout is used.
class WidgetDataService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        WidgetRowFactory(applicationContext, intent.getStringExtra("kind") ?: "agenda")
}

class WidgetRowFactory(
    private val context: Context,
    private val kind: String,
) : RemoteViewsService.RemoteViewsFactory {
    private var items: JSONArray = JSONArray()
    private var dark = true

    override fun onCreate() {}
    override fun onDestroy() {}

    override fun onDataSetChanged() {
        val prefs = context.getSharedPreferences("HomeWidgetPreferences", Context.MODE_PRIVATE)
        dark = prefs.getBoolean("dark", true)
        items = WidgetPayload.items(prefs, if (kind == "timetable") "timetable" else "agenda")
    }

    override fun getCount(): Int = items.length()

    override fun getViewAt(position: Int): RemoteViews {
        val palette = WidgetColors.of(dark)
        val item = items.getJSONObject(position)
        val overdue = item.optBoolean("overdue")

        return if (kind == "timetable") {
            RemoteViews(context.packageName, R.layout.widget_timetable_item).apply {
                setInt(
                    R.id.row_period,
                    "setBackgroundResource",
                    if (dark) R.drawable.widget_badge_dark else R.drawable.widget_badge_light,
                )
                setTextViewText(R.id.row_period, item.optString("period"))
                setTextColor(R.id.row_period, palette.accent)
                setTextViewText(R.id.row_subject, item.optString("subject"))
                setTextColor(R.id.row_subject, palette.title)
                setTextViewText(R.id.row_meta, item.optString("meta"))
                setTextColor(R.id.row_meta, palette.soft)
            }
        } else {
            RemoteViews(context.packageName, R.layout.widget_agenda_item).apply {
                setTextViewText(R.id.item_tag, item.optString("tag"))
                setTextColor(R.id.item_tag, if (overdue) palette.marker else palette.accent)
                setTextViewText(R.id.item_title, item.optString("title"))
                setTextColor(R.id.item_title, if (overdue) palette.marker else palette.title)
                setTextViewText(R.id.item_meta, item.optString("meta"))
                setTextColor(R.id.item_meta, if (overdue) palette.marker else palette.soft)
            }
        }
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 2
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = false
}

/// payload + palette helpers shared by providers and factories
object WidgetPayload {
    fun items(prefs: android.content.SharedPreferences, key: String): JSONArray =
        JSONObject(prefs.getString(key, "{}") ?: "{}").optJSONArray("items") ?: JSONArray()

    fun meta(prefs: android.content.SharedPreferences, key: String): JSONObject =
        JSONObject(prefs.getString(key, "{}") ?: "{}")
}

object WidgetColors {
    data class Palette(
        val title: Int,
        val soft: Int,
        val accent: Int,
        val marker: Int,
        val divider: Int,
    )

    fun of(dark: Boolean): Palette =
        if (dark) {
            Palette(
                title = Color.parseColor("#ECE6D6"),
                soft = Color.parseColor("#A29A88"),
                accent = Color.parseColor("#8FB99A"),
                marker = Color.parseColor("#E08A63"),
                divider = Color.parseColor("#3A3427"),
            )
        } else {
            Palette(
                title = Color.parseColor("#26221B"),
                soft = Color.parseColor("#756E60"),
                accent = Color.parseColor("#31633F"),
                marker = Color.parseColor("#C14B26"),
                divider = Color.parseColor("#E8E3D5"),
            )
        }
}
