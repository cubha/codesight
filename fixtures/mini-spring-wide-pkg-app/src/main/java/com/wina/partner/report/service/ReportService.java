package com.wina.partner.report.service;

import com.wina.partner.report.repository.ReportRepository;
import org.springframework.stereotype.Service;

@Service
public class ReportService {
    private final ReportRepository repository;
    public ReportService(ReportRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
