package com.wina.partner.settings.repository;

import com.wina.partner.settings.domain.Settings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettingsRepository extends JpaRepository<Settings, Long> {
}
