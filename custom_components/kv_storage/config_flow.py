"""Create named stores from Settings > Devices & services."""

import re

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN
from .panel import CONF_SHOW_SIDEBAR


class KVStorageConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return KVStorageOptionsFlow()

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            name = user_input["name"].strip()
            if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", name):
                errors["name"] = "invalid_name"
            else:
                await self.async_set_unique_id(name)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=name, data={"name": name})
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("name"): str}),
            errors=errors,
        )


class KVStorageOptionsFlow(config_entries.OptionsFlow):
    """Edit the shared panel preference from any store entry."""

    async def async_step_init(self, user_input=None):
        panel = self.hass.data.get(DOMAIN, {}).get("panel")
        if panel is None:
            return self.async_abort(reason="integration_not_loaded")
        errors = {}
        if user_input is not None:
            try:
                await panel.async_set_visibility(user_input[CONF_SHOW_SIDEBAR])
            except (OSError, HomeAssistantError):
                errors["base"] = "save_failed"
            else:
                # The value is global, so per-store options must not override it.
                return self.async_create_entry(title="", data={})
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SHOW_SIDEBAR, default=panel.show_sidebar): bool,
                }
            ),
            errors=errors,
        )
