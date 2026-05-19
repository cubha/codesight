package com.wina.agency.main.controller;

import com.wina.agency.main.service.MainService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/agency/main")
public class MainController {
    private final MainService service;
    public MainController(MainService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
