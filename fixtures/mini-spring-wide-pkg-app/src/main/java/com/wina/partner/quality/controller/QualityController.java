package com.wina.partner.quality.controller;

import com.wina.partner.quality.service.QualityService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/quality")
public class QualityController {
    private final QualityService service;
    public QualityController(QualityService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
