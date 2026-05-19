package com.wina.partner.quality.service;

import com.wina.partner.quality.repository.QualityRepository;
import org.springframework.stereotype.Service;

@Service
public class QualityService {
    private final QualityRepository repository;
    public QualityService(QualityRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
