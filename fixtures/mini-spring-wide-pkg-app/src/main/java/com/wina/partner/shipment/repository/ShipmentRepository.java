package com.wina.partner.shipment.repository;

import com.wina.partner.shipment.domain.Shipment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShipmentRepository extends JpaRepository<Shipment, Long> {
}
