package com.wina.partner.report.controller;

import com.wina.partner.report.service.ReportService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/report")
public class ReportController {
    private final ReportService service;
    public ReportController(ReportService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
