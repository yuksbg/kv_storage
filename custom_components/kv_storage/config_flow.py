"""Create named stores from Settings > Devices & services."""

import re

import voluptuous as vol
from homeassistant import config_entries

from .const import DOMAIN


class KVStorageConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

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
