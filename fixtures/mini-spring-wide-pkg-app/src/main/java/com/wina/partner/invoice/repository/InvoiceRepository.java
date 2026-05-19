package com.wina.partner.invoice.repository;

import com.wina.partner.invoice.domain.Invoice;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {
}
