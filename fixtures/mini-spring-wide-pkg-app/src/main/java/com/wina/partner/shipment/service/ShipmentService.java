package com.wina.partner.shipment.service;

import com.wina.partner.shipment.repository.ShipmentRepository;
import org.springframework.stereotype.Service;

@Service
public class ShipmentService {
    private final ShipmentRepository repository;
    public ShipmentService(ShipmentRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
