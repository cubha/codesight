package com.wina.partner.dashboard.service;

import com.wina.partner.dashboard.repository.DashboardRepository;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {
    private final DashboardRepository repository;
    public DashboardService(DashboardRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
