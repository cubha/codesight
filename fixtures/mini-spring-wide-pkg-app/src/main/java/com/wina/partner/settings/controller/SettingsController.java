package com.wina.partner.settings.controller;

import com.wina.partner.settings.service.SettingsService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/settings")
public class SettingsController {
    private final SettingsService service;
    public SettingsController(SettingsService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
