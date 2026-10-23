"""Shared, persistent sidebar preferences for all stores."""

import asyncio

from homeassistant.components import frontend, panel_custom
from homeassistant.helpers.storage import Store

from .const import DOMAIN

CONF_SHOW_SIDEBAR = "show_sidebar"


class PanelSettings:
    """One global preference, independent of individual store lifecycles."""

    def __init__(self, hass):
        self.hass = hass
        self.show_sidebar = True
        self._storage = Store(hass, 1, f"{DOMAIN}_settings")
        self._lock = asyncio.Lock()

    async def async_initialize(self):
        saved = await self._storage.async_load()
        if saved is not None:
            self.show_sidebar = saved.get(CONF_SHOW_SIDEBAR, True)
        await self._async_register()

    async def async_set_visibility(self, visible):
        async with self._lock:
            if visible == self.show_sidebar:
                return
            # Persist first: a failed write must not change the active preference.
            await self._storage.async_save({CONF_SHOW_SIDEBAR: visible})
            self.show_sidebar = visible
            frontend.async_remove_panel(self.hass, DOMAIN, warn_if_unknown=False)
            await self._async_register()

    async def _async_register(self):
        # No sidebar title hides the link but retains the panel route.
        await panel_custom.async_register_panel(
            self.hass,
            webcomponent_name="kv-storage-panel",
            frontend_url_path=DOMAIN,
            sidebar_title="KV Storage" if self.show_sidebar else None,
            sidebar_icon="mdi:database",
            module_url="/kv_storage_static/kv-storage-panel.js?v=1.1.0",
            embed_iframe=False,
            require_admin=False,
        )
