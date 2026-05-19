package com.wina.partner.settings.service;

import com.wina.partner.settings.repository.SettingsRepository;
import org.springframework.stereotype.Service;

@Service
public class SettingsService {
    private final SettingsRepository repository;
    public SettingsService(SettingsRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
