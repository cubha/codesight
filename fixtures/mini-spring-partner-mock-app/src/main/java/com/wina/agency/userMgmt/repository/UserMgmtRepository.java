package com.wina.agency.userMgmt.repository;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;

@Mapper
public interface UserMgmtRepository {
    List<Map<String, Object>> retrieveUserList();
    int saveUser();
    int removeUser();
}
