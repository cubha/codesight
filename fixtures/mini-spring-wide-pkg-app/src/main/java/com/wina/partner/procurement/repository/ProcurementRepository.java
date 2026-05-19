package com.wina.partner.procurement.repository;

import com.wina.partner.procurement.domain.Procurement;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProcurementRepository extends JpaRepository<Procurement, Long> {
}
